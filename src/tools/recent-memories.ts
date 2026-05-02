import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../server-context.js";
import { RecentResultSchema, type RecentResult } from "../structured-content.js";
import {
  projectParam,
  toProjectRef,
  noteProjectRef,
  ensureBranchSynced,
} from "../helpers/project.js";
import {
  collectVisibleNotes,
  formatListEntry,
  storageLabel,
} from "../helpers/vault.js";

export function registerRecentMemoriesTool(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "recent_memories",
    {
      title: "Recent Memories",
      description:
        "Show the most recently updated memories.\n\n" +
        "Use this when:\n" +
        "- You want to see what changed most recently\n" +
        "- You are resuming work and want a quick chronological view\n\n" +
        "Do not use this when:\n" +
        "- You need topic-based search; use `recall`\n" +
        "- You need a tag/scope inventory; use `list`\n\n" +
        "Returns:\n" +
        "- Recently updated memories with ids, timestamps, storage labels, and basic metadata\n\n" +
        "Read-only.\n\n" +
        "Typical next step:\n" +
        "- Use `get` for exact inspection or `update` to continue refining a recent note.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: z.object({
        cwd: projectParam,
        scope: z.enum(["project", "global", "all"]).optional().default("all"),
        storedIn: z.enum(["project-vault", "main-vault", "any"]).optional().default("any"),
        limit: z.number().int().min(1).max(20).optional().default(5),
        includePreview: z.boolean().optional().default(true),
        includeStorage: z.boolean().optional().default(true),
        lifecycle: z.enum(["temporary", "permanent"]).optional().describe("Filter results by lifecycle. Useful for recovering working-state with `lifecycle: temporary` after `project_memory_summary` orientation."),
      }),
      outputSchema: RecentResultSchema,
    },
    async ({ cwd, scope, storedIn, limit, includePreview, includeStorage, lifecycle }) => {
      await ensureBranchSynced(ctx, cwd);

      const { project, entries } = await collectVisibleNotes(ctx, cwd, scope, undefined, storedIn);
      let filteredEntries = entries;
      if (lifecycle) {
        filteredEntries = entries.filter(({ note }) => note.lifecycle === lifecycle);
      }
      const recent = [...filteredEntries]
        .sort((a, b) => b.note.updatedAt.localeCompare(a.note.updatedAt))
        .slice(0, limit);

      if (recent.length === 0) {
        const structuredContent: RecentResult = { action: "recent_shown", project: toProjectRef(project), count: 0, limit: limit || 5, notes: [] };
        return { content: [{ type: "text", text: "No memories found." }], structuredContent };
      }

      const header = project && scope !== "global"
        ? `Recent memories for ${project.name}:`
        : "Recent memories:";
      const lines = recent.map((entry) => formatListEntry(entry, {
        includePreview,
        includeStorage,
        includeUpdated: true,
      }));

      const textContent = `${header}\n\n${lines.join("\n")}`;

      const structuredNotes = recent.map(({ note, vault }) => ({
        id: note.id,
        title: note.title,
        project: noteProjectRef(note),
        tags: note.tags,
        lifecycle: note.lifecycle,
        vault: storageLabel(vault),
        updatedAt: note.updatedAt,
        preview: includePreview && note.content ? note.content.substring(0, 100) + (note.content.length > 100 ? "..." : "") : undefined,
      }));

      const structuredContent: RecentResult = {
        action: "recent_shown",
        project: toProjectRef(project),
        count: recent.length,
        limit: limit || 5,
        notes: structuredNotes,
      };

      return { content: [{ type: "text", text: textContent }], structuredContent };
    }
  );
}
