import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../server-context.js";
import { resolveProject as resolveProjectFromModule } from "../helpers/project.js";
import { projectNotFoundResponse } from "../helpers/vault.js";
import { formatCommitBody } from "../helpers/git-commit.js";
import {
  pushAfterMutation as pushAfterMutationFromModule,
  buildMutationRetryContract,
  formatRetrySummary,
} from "../helpers/persistence.js";
import {
  SetAttachmentEnabledResultSchema,
  type SetAttachmentEnabledResult,
} from "../structured-content.js";
import { invalidateActiveProjectCache } from "../cache.js";

export function registerSetAttachmentEnabledTool(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "set_attachment_enabled",
    {
      title: "Set Attachment Enabled",
      description:
        "Use this when:\n" +
        "- You want to temporarily disable an attachment without removing it\n" +
        "- You want to re-enable a previously disabled attachment\n\n" +
        "Do not use this when:\n" +
        "- You want to permanently remove an attachment (use `remove_attachment`)\n" +
        "- You want to change the branch an attachment reads from (use `set_attachment_branch`)\n\n" +
        "Returns: the updated attachment config including attachmentId.\n\n" +
        "[mutating: writes config, git commits, may push]\n\n" +
        "Typical next step:\n" +
        "- Use `list_attachments` to verify the change.",
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
        enabled: z.boolean().describe("Whether the attachment should be enabled"),
      }),
      outputSchema: SetAttachmentEnabledResultSchema,
    },
    async ({ cwd, projectSlug, attachmentId, enabled }) => {
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

      const updatedAttachments = currentAttachments.map((att, i) =>
        i === attachmentIndex ? { ...att, enabled, updatedAt: new Date().toISOString() } : att,
      );

      await ctx.configStore.setProjectAttachments(project.id, updatedAttachments);
      ctx.vaultManager.clearAttachmentCaches();
      ctx.vaultManager.setAttachmentConfigs(project.id, updatedAttachments);
      await ctx.vaultManager.loadAttachmentsForProject(project.id);
      invalidateActiveProjectCache();

      const commitBody = formatCommitBody({
        projectName: project.name,
        description: `Attachment ${currentAttachments[attachmentIndex]?.projectSlug}: enabled=${enabled}`,
      });
      const commitMessage = `attachment: ${enabled ? "enable" : "disable"} ${currentAttachments[attachmentIndex]?.projectSlug} for ${project.name}`;
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

      const updated = updatedAttachments[attachmentIndex];
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

      const structuredContent: SetAttachmentEnabledResult = {
        action: "attachment_enabled_set",
        project: { id: project.id, name: project.name },
        attachment: {
          kind: updated.kind,
          attachmentId: updated.attachmentId,
          projectSlug: updated.projectSlug,
          projectName: updated.projectName,
          enabled: updated.enabled,
          branch:
            updated.kind === "mnemonic-vault"
              ? (updated as { kind: "mnemonic-vault"; branch?: string }).branch
              : undefined,
        },
        retry,
      };

      const deprecationHint =
        projectSlug && !attachmentId
          ? `\nNote: projectSlug is deprecated. Use attachmentId '${updated.attachmentId}' for future operations.`
          : "";

      return {
        content: [
          {
            type: "text",
            text:
              `Attachment ${updated.projectName} (${updated.projectSlug}) for ${project.name}: ${enabled ? "enabled" : "disabled"}` +
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
