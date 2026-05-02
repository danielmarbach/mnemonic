import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../server-context.js";
import {
  MemoryGraphResultSchema,
  type MemoryGraphResult,
} from "../structured-content.js";
import {
  projectParam,
  toProjectRef,
  ensureBranchSynced,
} from "../helpers/project.js";
import {
  type NoteEntry,
  collectVisibleNotes,
} from "../helpers/vault.js";

export function registerMemoryGraphTool(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "memory_graph",
    {
      title: "Memory Graph",
      description:
        "Show memory nodes and their relationships as a graph-oriented view.\n\n" +
        "Use this when:\n" +
        "- You want to inspect how notes connect across a topic or project\n" +
        "- You are evaluating whether relationships are too sparse or too dense\n\n" +
        "Do not use this when:\n" +
        "- You only need one note; use `get`\n" +
        "- You only need ranked topic matches; use `recall`\n\n" +
        "Returns:\n" +
        "- Memory nodes and relationship edges for the requested slice\n\n" +
        "Read-only.\n\n" +
        "Typical next step:\n" +
        "- Use `get`, `relate`, `unrelate`, or `consolidate` based on what the graph reveals.",
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
        limit: z.number().int().min(1).max(50).optional().default(25),
      }),
      outputSchema: MemoryGraphResultSchema,
    },
    async ({ cwd, scope, storedIn, limit }) => {
      await ensureBranchSynced(ctx, cwd);

      const { project, entries } = await collectVisibleNotes(ctx, cwd, scope, undefined, storedIn);
      if (entries.length === 0) {
        const structuredContent: MemoryGraphResult = { action: "graph_shown", project: toProjectRef(project), nodes: [], limit, truncated: false };
        return { content: [{ type: "text", text: "No memories found." }], structuredContent };
      }

      const visibleIds = new Set(entries.map((entry) => entry.note.id));
      const lines = entries
        .filter((entry) => (entry.note.relatedTo?.length ?? 0) > 0)
        .slice(0, limit)
        .map((entry) => {
          const edges = (entry.note.relatedTo ?? [])
            .filter((rel) => visibleIds.has(rel.id))
            .map((rel) => `${rel.id} (${rel.type})`);
          return edges.length > 0 ? `- ${entry.note.id} -> ${edges.join(", ")}` : null;
        })
        .filter(Boolean);

      if (lines.length === 0) {
        const structuredContent: MemoryGraphResult = { action: "graph_shown", project: toProjectRef(project), nodes: [], limit, truncated: false };
        return { content: [{ type: "text", text: "No relationships found for that scope." }], structuredContent };
      }

      const header = project && scope !== "global"
        ? `Memory graph for ${project.name}:`
        : "Memory graph:";
      
      const textContent = `${header}\n\n${lines.join("\n")}`;
      
      // Build structured graph
      const structuredNodes = entries
        .filter((entry: NoteEntry) => (entry.note.relatedTo?.length ?? 0) > 0)
        .slice(0, limit)
        .map((entry: NoteEntry) => {
          const edges = (entry.note.relatedTo ?? [])
            .filter((rel) => visibleIds.has(rel.id))
            .map((rel) => ({ toId: rel.id, type: rel.type }));
          return {
            id: entry.note.id,
            title: entry.note.title,
            edges: edges.length > 0 ? edges : [],
          };
        })
        .filter((node: { edges: any[] }) => node.edges.length > 0);
      
      const structuredContent: MemoryGraphResult = {
        action: "graph_shown",
        project: toProjectRef(project),
        nodes: structuredNodes,
        limit,
        truncated: structuredNodes.length < entries.filter(e => (e.note.relatedTo?.length ?? 0) > 0).length,
      };
      
      return { content: [{ type: "text", text: textContent }], structuredContent };
    }
  );
}
