import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../server-context.js";
import {
  ensureBranchSynced,
  resolveProject,
  noteProjectRef,
  projectParam,
} from "../helpers/project.js";
import { storageLabel } from "../helpers/vault.js";
import { WhereIsResultSchema, type WhereIsResult, NoteIdSchema } from "../structured-content.js";

export function registerWhereIsMemoryTool(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "where_is_memory",
    {
      title: "Where Is Memory",
      description:
        "Use this when:\n" +
        "- You know the id and want to see where the memory lives\n" +
        "- You are deciding whether a note should be moved between project storage locations\n\n" +
        "Do not use this when:\n" +
        "- You need the full note content; use `get`\n" +
        "- You want to search for a note by topic; use `recall`\n\n" +
        "Returns: title, project association, storage label, updated time, relationship count.\n\n" +
        "Typical next step:\n" +
        "- Use `move_memory` if the storage location is wrong, or `get` for full inspection.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: z.object({
        id: NoteIdSchema.describe(
          "Exact memory id. Use an id returned by `recall`, `list`, `recent_memories`, or `where_is`.",
        ),
        cwd: projectParam,
      }),
      outputSchema: WhereIsResultSchema,
    },
    async ({ id, cwd }) => {
      await ensureBranchSynced(ctx, cwd);

      const project = await resolveProject(ctx, cwd);
      const found = await ctx.vaultManager.findNote(id, cwd, { projectId: project?.id });
      if (!found) {
        return {
          content: [{ type: "text", text: `No memory found with id '${id}'` }],
          isError: true,
        };
      }

      const { note, vault } = found;
      const vaultLabel = storageLabel(vault);
      const projectDisplay =
        note.projectName && note.project
          ? `${note.projectName} (${note.project})`
          : (note.projectName ?? note.project ?? "global");
      const relatedCount = note.relatedTo?.length ?? 0;

      const structuredContent: WhereIsResult = {
        action: "located",
        id: note.id,
        title: note.title,
        project: noteProjectRef(note),
        vault: vaultLabel,
        updatedAt: note.updatedAt,
        relatedCount,
      };

      return {
        content: [
          {
            type: "text",
            text: `'${note.title}' (${id})\nproject: ${projectDisplay} | stored: ${vaultLabel} | updated: ${note.updatedAt} | related: ${relatedCount}`,
          },
        ],
        structuredContent,
      };
    },
  );
}
