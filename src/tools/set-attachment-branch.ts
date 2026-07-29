import { z } from "zod";
import path from "path";
import { simpleGit } from "simple-git";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../server-context.js";
import type { MnemonicVaultAttachmentConfig } from "../vault.js";
import { resolveProject as resolveProjectFromModule } from "../helpers/project.js";
import { projectNotFoundResponse } from "../helpers/vault.js";
import { formatCommitBody } from "../helpers/git-commit.js";
import {
  pushAfterMutation as pushAfterMutationFromModule,
  buildMutationRetryContract,
  formatRetrySummary,
} from "../helpers/persistence.js";
import {
  SetAttachmentBranchResultSchema,
  type SetAttachmentBranchResult,
} from "../structured-content.js";
import { invalidateActiveProjectCache } from "../cache.js";
import { InvalidBranchNameError } from "../domain-errors.js";
import { expandHomePath } from "../paths.js";

const VALID_BRANCH_PATTERN = /^[a-zA-Z0-9._/-]+$/;

function validateBranch(branch: string): void {
  if (branch !== "" && !VALID_BRANCH_PATTERN.test(branch)) {
    throw new InvalidBranchNameError(branch, VALID_BRANCH_PATTERN.source);
  }
}

export function registerSetAttachmentBranchTool(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "set_attachment_branch",
    {
      title: "Set Attachment Branch",
      description:
        "Use this when:\n" +
        "- You want to change which branch an attached vault reads notes from\n" +
        "- You need to update the branch after the attached repo changed its default branch\n\n" +
        "Do not use this when:\n" +
        "- You want to enable/disable an attachment (use `set_attachment_enabled`)\n" +
        "- You want to remove an attachment (use `remove_attachment`)\n" +
        "- The attachment is a document-source (document sources have no branch concept)\n\n" +
        "Returns: the updated attachment config with attachmentId, new branch, and tip hash.\n\n" +
        "[mutating: writes config, git commits, may push]\n\n" +
        "Typical next step:\n" +
        "- Use `list_attachments` to verify the branch change.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: z.object({
        cwd: z
          .string()
          .describe(
            "Absolute path of the project working directory. Required for project-scoped routing, vault selection, and search boosting.",
          ),
        projectSlug: z
          .string()
          .optional()
          .describe("The attached repository's project slug. Deprecated: prefer attachmentId."),
        attachmentId: z.string().optional().describe("The persistent attachment identifier."),
        branch: z
          .string()
          .describe(
            "The branch to read notes from. Use empty string for working-tree mode (not recommended).",
          ),
      }),
      outputSchema: SetAttachmentBranchResultSchema,
    },
    async ({ cwd, projectSlug, attachmentId, branch }) => {
      const project = await resolveProjectFromModule(ctx, cwd);
      if (!project) {
        return projectNotFoundResponse(cwd);
      }

      const currentAttachments = await ctx.configStore.getProjectAttachments(project.id);

      // Resolve by attachmentId first, then by projectSlug
      let attachmentIndex = -1;
      if (attachmentId) {
        attachmentIndex = currentAttachments.findIndex((a) => a.attachmentId === attachmentId);
        if (attachmentIndex === -1) {
          return {
            content: [
              {
                type: "text",
                text: `No attachment found with id '${attachmentId}' for project ${project.name}.`,
              },
            ],
            isError: true,
          };
        }
      } else if (projectSlug) {
        const matching = currentAttachments.filter((a) => a.projectSlug === projectSlug);
        if (matching.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No attachment found with slug '${projectSlug}' for project ${project.name}.`,
              },
            ],
            isError: true,
          };
        }
        if (matching.length > 1) {
          const ids = matching.map((a) => a.attachmentId).join(", ");
          return {
            content: [
              {
                type: "text",
                text: `Multiple attachments found with slug '${projectSlug}'. Use attachmentId instead: ${ids}`,
              },
            ],
            isError: true,
          };
        }
        attachmentIndex = currentAttachments.findIndex((a) => a.projectSlug === projectSlug);
      } else {
        return {
          content: [
            {
              type: "text",
              text: "Either projectSlug or attachmentId is required.",
            },
          ],
          isError: true,
        };
      }

      const att = currentAttachments[attachmentIndex];
      if (!att) {
        return {
          content: [
            { type: "text" as const, text: `Attachment at index ${attachmentIndex} not found.` },
          ],
          isError: true,
        };
      }

      // Reject document-source attachments
      if (att.kind === "document-source") {
        return {
          content: [
            {
              type: "text",
              text: `Cannot set branch on document-source attachment '${att.projectName}'. Document sources have no branch concept.`,
            },
          ],
          isError: true,
        };
      }

      const vaultAtt = att as MnemonicVaultAttachmentConfig;
      const effectiveBranch = branch.trim();
      validateBranch(effectiveBranch);

      let branchTipHash = "";
      if (effectiveBranch) {
        const resolvedLocalPath = path.resolve(expandHomePath(vaultAtt.localPath));
        const git = simpleGit(resolvedLocalPath);
        const hashResult = await git.raw(["rev-parse", effectiveBranch]).catch(() => null);
        branchTipHash = hashResult?.trim() ?? "";
      }

      const now = new Date().toISOString();
      const updatedAttachments = currentAttachments.map((a, i) =>
        i === attachmentIndex
          ? { ...a, branch: effectiveBranch, branchTipHash, updatedAt: now }
          : a,
      );

      await ctx.configStore.setProjectAttachments(project.id, updatedAttachments);
      ctx.vaultManager.clearAttachmentCaches();
      ctx.vaultManager.setAttachmentConfigs(project.id, updatedAttachments);
      await ctx.vaultManager.loadAttachmentsForProject(project.id);
      invalidateActiveProjectCache();

      const commitBody = formatCommitBody({
        projectName: project.name,
        description: `Attachment ${vaultAtt.projectSlug}: branch=${effectiveBranch || "(working-tree)"}, tipHash=${branchTipHash || "none"}`,
      });
      const commitMessage = `attachment: set branch ${effectiveBranch || "(working-tree)"} for ${vaultAtt.projectSlug} on ${project.name}`;
      const commitFiles = ["config.json"];
      const commitStatus = await ctx.vaultManager.main.git.commitWithStatus(
        commitMessage,
        commitFiles,
        commitBody,
      );
      const pushStatus =
        commitStatus.status === "committed"
          ? await pushAfterMutationFromModule(ctx, ctx.vaultManager.main)
          : { status: "skipped" as const, reason: "commit-failed" as const };
      const retry = buildMutationRetryContract({
        commit: commitStatus,
        commitMessage,
        commitBody,
        files: commitFiles,
        cwd,
        vault: ctx.vaultManager.main,
        mutationApplied: true,
      });

      const updated = updatedAttachments[attachmentIndex] as
        | MnemonicVaultAttachmentConfig
        | undefined;
      if (!updated) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Updated attachment at index ${attachmentIndex} not found.`,
            },
          ],
          isError: true,
        };
      }
      const warnings: string[] = [];
      if (!effectiveBranch) {
        warnings.push(
          "Branch is empty — attached vault will read from working tree (not recommended for production).",
        );
      }

      const structuredContent: SetAttachmentBranchResult = {
        action: "attachment_branch_set",
        project: { id: project.id, name: project.name },
        attachment: {
          kind: "mnemonic-vault",
          attachmentId: updated.attachmentId,
          projectSlug: updated.projectSlug,
          projectName: updated.projectName,
          localPath: updated.localPath,
          vaultFolder: updated.vaultFolder,
          enabled: updated.enabled,
          branch: updated.branch,
          branchTipHash: updated.branchTipHash,
        },
        warnings: warnings.length > 0 ? warnings : undefined,
        retry,
      };

      const branchDisplay = effectiveBranch || "(working-tree)";
      const deprecationHint =
        projectSlug && !attachmentId
          ? `\nNote: projectSlug is deprecated. Use attachmentId '${updated.attachmentId}' for future operations.`
          : "";

      return {
        content: [
          {
            type: "text",
            text:
              `Attachment ${updated.projectName} (${updated.projectSlug}) for ${project.name}: branch=${branchDisplay}` +
              deprecationHint +
              (warnings.length > 0 ? `\nWarnings: ${warnings.join("; ")}` : "") +
              (commitStatus.status === "failed"
                ? `\n${formatRetrySummary(retry) ?? `Commit failed. Push status: ${pushStatus.status}.`}`
                : ""),
          },
        ],
        structuredContent,
      };
    },
  );
}
