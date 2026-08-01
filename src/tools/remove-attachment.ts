import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import type { McpServer } from "@modelcontextprotocol/server";
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
  RemoveAttachmentResultSchema,
  type RemoveAttachmentResult,
} from "../structured-content.js";
import { invalidateActiveProjectCache } from "../cache.js";
import { attempt } from "../error-utils.js";
import { expandHomePath } from "../paths.js";

export function registerRemoveAttachmentTool(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "remove_attachment",
    {
      title: "Remove Attachment",
      description:
        "Use this when:\n" +
        "- You want to detach an external repository's mnemonic vault from the current project\n" +
        "- You need to clean up stale or incorrect attachments\n\n" +
        "Do not use this when:\n" +
        "- You want to disable an attachment temporarily (use `set_attachment_enabled`)\n\n" +
        "Returns: confirmation of the removed attachment including its attachmentId.\n\n" +
        "[mutating: writes config, git commits, may push]\n\n" +
        "Typical next step:\n" +
        "- Use `list_attachments` to verify the attachment was removed.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
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
          .describe(
            "The attached repository's project slug (as returned by add_attachment or list_attachments). Deprecated: prefer attachmentId.",
          ),
        attachmentId: z
          .string()
          .optional()
          .describe(
            "The persistent attachment identifier (as returned by add_attachment or list_attachments).",
          ),
      }),
      outputSchema: RemoveAttachmentResultSchema,
    },
    async ({ cwd, projectSlug, attachmentId }) => {
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

      const removed = currentAttachments[attachmentIndex];
      if (!removed) {
        return {
          content: [
            { type: "text" as const, text: `Attachment at index ${attachmentIndex} not found.` },
          ],
          isError: true,
        };
      }

      // Clean up embeddings for mnemonic-vault attachments
      if (removed.kind === "mnemonic-vault") {
        const resolvedLocalPath = path.resolve(expandHomePath(removed.localPath));
        const embeddingsDir = path.join(
          resolvedLocalPath,
          (removed as MnemonicVaultAttachmentConfig).vaultFolder,
          "attachments",
          project.id,
        );
        await attempt("remove-attachment:clean-embeddings", () =>
          fs.rm(embeddingsDir, { recursive: true, force: true }),
        );
      }

      // Clean up per-attachment chunk embeddings for document-source attachments
      // (<gitRoot>/.mnemonic/embeddings/doc-source/<attachmentId>/).
      if (removed.kind === "document-source") {
        const projectVault = cwd ? await ctx.vaultManager.getProjectVaultIfExists(cwd) : null;
        const embeddingsDir = projectVault?.storage.embeddingsDir;
        if (embeddingsDir) {
          const dir = path.join(embeddingsDir, "doc-source", removed.attachmentId);
          await attempt("remove-attachment:clean-chunk-embeddings", () =>
            fs.rm(dir, { recursive: true, force: true }),
          );
        }
      }

      const updatedAttachments = currentAttachments.filter((_, i) => i !== attachmentIndex);
      await ctx.configStore.setProjectAttachments(project.id, updatedAttachments);
      ctx.vaultManager.removeAttachment(project.id, removed.projectSlug);
      invalidateActiveProjectCache();

      const commitBody = formatCommitBody({
        projectName: project.name,
        description: `Removed attachment: ${removed.projectName} (${removed.projectSlug})\nKind: ${removed.kind}`,
      });
      const commitMessage = `attachment: remove ${removed.projectName} from ${project.name}`;
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

      const structuredContent: RemoveAttachmentResult = {
        action: "attachment_removed",
        project: { id: project.id, name: project.name },
        removedAttachment: {
          kind: removed.kind,
          attachmentId: removed.attachmentId,
          projectSlug: removed.projectSlug,
          projectName: removed.projectName,
          localPath: removed.localPath,
          ...(removed.kind === "mnemonic-vault"
            ? {
                vaultFolder: (removed as MnemonicVaultAttachmentConfig).vaultFolder,
                branch: (removed as MnemonicVaultAttachmentConfig).branch,
              }
            : {}),
        },
        retry,
      };

      const deprecationHint =
        projectSlug && !attachmentId
          ? `\nNote: projectSlug is deprecated. Use attachmentId '${removed.attachmentId}' for future operations.`
          : "";

      return {
        content: [
          {
            type: "text",
            text:
              `Attachment removed from ${project.name}: ${removed.projectName} (${removed.projectSlug})` +
              deprecationHint +
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
