import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../server-context.js";
import { resolveProject as resolveProjectFromModule } from "../helpers/project.js";
import { projectNotFoundResponse } from "../helpers/vault.js";
import { formatCommitBody } from "../helpers/git-commit.js";
import { pushAfterMutation as pushAfterMutationFromModule, buildMutationRetryContract, formatRetrySummary } from "../helpers/persistence.js";
import { RemoveAttachmentResultSchema, type RemoveAttachmentResult } from "../structured-content.js";
import { invalidateActiveProjectCache } from "../cache.js";

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
        "Returns: confirmation of the removed attachment.\n\n" +
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
        cwd: z.string().describe("Absolute path of the project working directory. Required for project-scoped routing, vault selection, and search boosting."),
        projectSlug: z.string().describe("The attached repository's project slug (as returned by add_attachment or list_attachments)"),
      }),
      outputSchema: RemoveAttachmentResultSchema,
    },
    async ({ cwd, projectSlug }) => {
      const project = await resolveProjectFromModule(ctx, cwd);
      if (!project) {
        return projectNotFoundResponse(cwd);
      }

      const currentAttachments = await ctx.configStore.getProjectAttachments(project.id);
      const attachmentIndex = currentAttachments.findIndex(a => a.projectSlug === projectSlug);
      if (attachmentIndex === -1) {
        return {
          content: [{ type: "text", text: `No attachment found with slug '${projectSlug}' for project ${project.name}.` }],
          isError: true,
        };
      }

      const removed = currentAttachments[attachmentIndex]!;

      const embeddingsDir = path.join(removed.localPath, removed.vaultFolder, "attachments", project.id);
      try {
        await fs.rm(embeddingsDir, { recursive: true, force: true });
      } catch {
        // Directory may not exist, that's fine
      }

      const updatedAttachments = currentAttachments.filter((_, i) => i !== attachmentIndex);
      await ctx.configStore.setProjectAttachments(project.id, updatedAttachments);
      ctx.vaultManager.removeAttachment(project.id, projectSlug);
      invalidateActiveProjectCache();

      const commitBody = formatCommitBody({
        projectName: project.name,
        description: `Removed attachment: ${removed.projectName} (${projectSlug})\nPath: ${removed.localPath}`,
      });
      const commitMessage = `attachment: remove ${removed.projectName} from ${project.name}`;
      const commitFiles = ["config.json"];
      const commitStatus = await ctx.vaultManager.main.git.commitWithStatus(commitMessage, commitFiles, commitBody);
      const pushStatus = commitStatus.status === "committed"
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
          projectSlug: removed.projectSlug,
          projectName: removed.projectName,
          localPath: removed.localPath,
          vaultFolder: removed.vaultFolder,
          branch: removed.branch,
        },
        retry,
      };

      return {
        content: [{
          type: "text",
          text:
            `Attachment removed from ${project.name}: ${removed.projectName} (${projectSlug})` +
            (commitStatus.status === "failed"
              ? `\n${formatRetrySummary(retry) ?? `Commit failed. Push status: ${pushStatus.status}.`}`
              : ""),
        }],
        structuredContent,
      };
    }
  );
}