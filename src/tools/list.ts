import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../server-context.js";
import { ListResultSchema, type ListResult, type ProjectRef } from "../structured-content.js";
import type { Note, NoteLifecycle } from "../storage.js";
import { projectParam, ensureBranchSynced, noteProjectRef } from "../helpers/project.js";
import { collectVisibleNotes, formatListEntry, storageLabel } from "../helpers/vault.js";

export function registerListTool(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "list",
    {
      title: "List Memories",
      description:
        "List stored memories with filtering by scope, storage label, and tags.\n\n" +
        "Use this when:\n" +
        "- You want to browse what exists for a project or globally\n" +
        "- You want a deterministic filtered list rather than a semantic search\n" +
        "- You are checking inventory before creating, updating, or consolidating notes\n\n" +
        "Do not use this when:\n" +
        "- You want topic-based semantic search; use `recall`\n" +
        "- You already know the exact id; use `get`\n\n" +
        "Returns:\n" +
        "- Matching memories with ids, titles, scope/storage context, and metadata\n\n" +
        "Read-only.\n\n" +
        "Typical next step:\n" +
        "- Use `get` for exact inspection or `update` / `consolidate` for cleanup.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: z.object({
        cwd: projectParam,
        scope: z
          .enum(["project", "global", "all"])
          .optional()
          .default("all")
          .describe(
            "'project' = only this project's memories (project-scoped storage); " +
            "'global' = only unscoped memories (main/global storage); " +
            "'all' = everything visible from this context (default)"
          ),
        storedIn: z
          .enum(["project-vault", "main-vault", "any"])
          .optional()
          .default("any")
          .describe(
            "Storage-label filter. Use `main-vault` for main/global storage. " +
            "Use `project-vault` as the broad filter for any project vault, including sub-vaults. " +
            "Results may still return a more specific label such as `sub-vault:.mnemonic-lib`."
          ),
        tags: z.array(z.string()).optional().describe("Filter to notes matching all of these tags."),
        includeRelations: z.boolean().optional().default(false).describe("Include related memory ids and relationship types"),
        includePreview: z.boolean().optional().default(false).describe("Include a short content preview for each note"),
        includeStorage: z.boolean().optional().default(false).describe("Show which vault each note is stored in"),
        includeUpdated: z.boolean().optional().default(false).describe("Include last-updated timestamp for each note"),
      }),
      outputSchema: ListResultSchema,
    },
    async ({ cwd, scope, storedIn, tags, includeRelations, includePreview, includeStorage, includeUpdated }) => {
      await ensureBranchSynced(ctx, cwd);

      const { project, entries } = await collectVisibleNotes(ctx, cwd, scope, tags, storedIn);

      if (entries.length === 0) {
        const structuredContent: ListResult = { action: "listed", count: 0, scope: scope || "all", storedIn: storedIn || "any", project: project ? { id: project.id, name: project.name } : undefined, notes: [] };
        return { content: [{ type: "text", text: "No memories found." }], structuredContent };
      }

      const lines = entries.map((entry) => formatListEntry(entry, {
        includeRelations,
        includePreview,
        includeStorage,
        includeUpdated,
      }));

      const header = project && scope !== "global"
        ? `${entries.length} memories (project: ${project.name}, scope: ${scope}, storedIn: ${storedIn}):`
        : `${entries.length} memories (scope: ${scope}, storedIn: ${storedIn}):`;

      const textContent = `${header}\n\n${lines.join("\n")}`;

      const structuredNotes: Array<{
        id: string;
        title: string;
        project?: ProjectRef;
        tags: string[];
        lifecycle: NoteLifecycle;
        role?: Note["role"];
        vault: string;
        updatedAt: string;
        hasRelated?: boolean;
      }> = entries.map(({ note, vault }) => ({
        id: note.id,
        title: note.title,
        project: noteProjectRef(note),
        tags: note.tags,
        lifecycle: note.lifecycle,
        role: note.role,
        vault: storageLabel(vault),
        updatedAt: note.updatedAt,
        hasRelated: note.relatedTo && note.relatedTo.length > 0,
      }));

      const structuredContent: ListResult = {
        action: "listed",
        count: entries.length,
        scope: scope || "all",
        storedIn: storedIn || "any",
        project: project ? { id: project.id, name: project.name } : undefined,
        notes: structuredNotes,
        options: {
          includeRelations,
          includePreview,
          includeStorage,
          includeUpdated,
        },
      };

      return { content: [{ type: "text", text: textContent }], structuredContent };
    }
  );
}
