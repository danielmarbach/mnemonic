import { z } from "zod";
import path from "path";
import fs from "fs/promises";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../server-context.js";
import { resolveProject as resolveProjectFromModule } from "../helpers/project.js";
import { projectNotFoundResponse } from "../helpers/vault.js";
import { ListAttachmentsResultSchema, type ListAttachmentsResult } from "../structured-content.js";
import { attempt } from "../error-utils.js";
import { expandHomePath } from "../paths.js";

export function registerListAttachmentsTool(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "list_attachments",
    {
      title: "List Attachments",
      description:
        "Use this when:\n" +
        "- You want to see all attached repositories for a project\n" +
        "- You need to check the status of attachment vaults\n\n" +
        "Do not use this when:\n" +
        "- You want to add or remove an attachment (use `add_attachment` or `remove_attachment`)\n\n" +
        "Returns: list of attachments with their status, branch, and path information.\n\n" +
        "Typical next step:\n" +
        "- Use `set_attachment_enabled` to toggle an attachment, or `recall` to search across attached vaults.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: z.object({
        cwd: z.string().describe("Absolute path of the project working directory. Required for project-scoped routing, vault selection, and search boosting."),
      }),
      outputSchema: ListAttachmentsResultSchema,
    },
    async ({ cwd }) => {
      const project = await resolveProjectFromModule(ctx, cwd);
      if (!project) {
        return projectNotFoundResponse(cwd);
      }

      const attachments = await ctx.configStore.getProjectAttachments(project.id);
      const maxAttachments = await ctx.configStore.getMaxAttachmentsPerProject();

      const attachmentEntries: ListAttachmentsResult["attachments"] = [];
      const lines: string[] = [];

      if (attachments.length === 0) {
        lines.push(`No attachments for project ${project.name} (${maxAttachments} attachment slots available).`);
      } else {
        lines.push(`Attachments for ${project.name} (${attachments.length}/${maxAttachments}):`);
      }

      for (const att of attachments) {
        const resolvedLocalPath = path.resolve(expandHomePath(att.localPath));
        const pathCheck = await attempt("list-attachments:check-path", () => fs.access(resolvedLocalPath));
        const pathExists = pathCheck.ok;

        let noteCount = 0;
        if (pathExists && att.enabled) {
          const noteCountResult = await attempt("list-attachments:count-notes", async () => {
            const attachedVaults = ctx.vaultManager.getAttachmentsForProject(project.id);
            const matchingVault = attachedVaults.find(v => v.attachmentRef?.projectSlug === att.projectSlug);
            if (matchingVault) {
              const notes = await matchingVault.storage.listNoteIds();
              return notes.length;
            }
            return 0;
          });
          if (noteCountResult.ok) {
            noteCount = noteCountResult.value;
          }
        }

        const status = att.enabled ? (pathExists ? "active" : "path-missing") : "disabled";
        const branchDisplay = att.branch || "(working-tree)";

        attachmentEntries.push({
          projectSlug: att.projectSlug,
          projectName: att.projectName,
          localPath: resolvedLocalPath,
          vaultFolder: att.vaultFolder,
          enabled: att.enabled,
          branch: att.branch,
          branchTipHash: att.branchTipHash,
          pathExists,
          noteCount,
        });

        lines.push(
          `  - ${att.projectName} (${att.projectSlug}): ${status}, branch=${branchDisplay}, notes=${noteCount}, path=${resolvedLocalPath}`
        );
      }

      const structuredContent: ListAttachmentsResult = {
        action: "attachments_listed",
        project: { id: project.id, name: project.name },
        attachments: attachmentEntries,
        maxAttachmentsPerProject: maxAttachments,
      };

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent,
      };
    }
  );
}