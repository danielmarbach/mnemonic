import { z } from "zod";
import { performance } from "perf_hooks";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../server-context.js";
import type { Note } from "../storage.js";
import type { Vault } from "../vault.js";
import {
  GetResultSchema,
  NoteIdSchema,
  type GetResult,
  type RelationshipPreview,
} from "../structured-content.js";
import {
  ensureBranchSynced,
  resolveProject,
  noteProjectRef,
  projectParam,
} from "../helpers/project.js";
import { storageLabel } from "../helpers/vault.js";
import { formatRelationshipPreview } from "../helpers/index.js";
import {
  getSessionCachedNote,
  setSessionCachedNote,
  recordSessionNoteAccess,
} from "../cache.js";
import { getRelationshipPreview } from "../relationships.js";

export function registerGetTool(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "get",
    {
      title: "Get Memory",
      description:
        "Use after `recall`, `list`, or `recent_memories` when you need the full note content.\n\n" +
        "Fetch one or more memories by exact id.\n\n" +
        "Use this when:\n" +
        "- You already know the memory id and need the full note content\n" +
        "- A previous tool returned ids that you now want to inspect exactly\n\n" +
        "Do not use this when:\n" +
        "- You are still searching by topic; use `recall`\n" +
        "- You want to browse many notes; use `list`\n\n" +
        "Returns:\n" +
        "- Full note content and metadata for the requested ids, including storage label\n" +
        "- Bounded 1-hop relationship previews when `includeRelationships` is true (max 3 shown)\n\n" +
        "Read-only.\n\n" +
        "Typical next step:\n" +
        "- Use `update`, `forget`, `move_memory`, or `relate` after inspection.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: z.object({
        ids: z.array(NoteIdSchema).min(1).describe("One or more memory ids to fetch"),
        cwd: projectParam,
        includeRelationships: z.boolean().optional().default(false).describe("Include bounded direct relationship previews (1-hop expansion, max 3 shown)"),
      }),
      outputSchema: GetResultSchema,
    },
    async ({ ids, cwd, includeRelationships }) => {
      const t0Get = performance.now();
      await ensureBranchSynced(ctx, cwd);

      const project = await resolveProject(ctx, cwd);
      const found: GetResult["notes"] = [];
      const notFound: string[] = [];

      for (const id of ids) {
        // Check session cache before hitting storage
        let result: { note: Note; vault: Vault } | null = null;
        if (project) {
          for (const vault of ctx.vaultManager.allKnownVaults()) {
            const cached = getSessionCachedNote(project.id, vault.storage.vaultPath, id);
            if (cached !== undefined) {
              result = { note: cached, vault };
              break;
            }
          }
        }
        if (!result) {
          result = await ctx.vaultManager.findNote(id, cwd);
        }
        if (!result) {
          notFound.push(id);
          continue;
        }
        const { note, vault } = result;

        let relationships: RelationshipPreview | undefined;
        if (includeRelationships) {
          relationships = await getRelationshipPreview(
            note,
            ctx.vaultManager.allKnownVaults(),
            { activeProjectId: project?.id, limit: 3 }
          );
        }

        found.push({
          id: note.id,
          title: note.title,
          content: note.content,
          project: noteProjectRef(note),
          tags: note.tags,
          lifecycle: note.lifecycle,
          role: note.role,
          alwaysLoad: note.alwaysLoad,
          relatedTo: note.relatedTo,
          createdAt: note.createdAt,
          updatedAt: note.updatedAt,
          vault: storageLabel(vault),
          relationships,
        });

        if (project) {
          setSessionCachedNote(project.id, vault.storage.vaultPath, note);
          recordSessionNoteAccess(project.id, vault.storage.vaultPath, note.id, "get");
        }
      }

      const lines: string[] = [];
      for (const note of found) {
        lines.push(`## ${note.title} (${note.id})`);
        lines.push(`project: ${note.project?.name ?? "global"} | stored: ${note.vault} | lifecycle: ${note.lifecycle}${note.role ? ` | role: ${note.role}` : ""}`);
        if (note.tags.length > 0) lines.push(`tags: ${note.tags.join(", ")}`);
        lines.push("");
        lines.push(note.content);
        if (note.relationships) {
          lines.push("");
          lines.push(formatRelationshipPreview(note.relationships));
        }
        lines.push("");
      }
      if (notFound.length > 0) {
        lines.push(`Not found: ${notFound.join(", ")}`);
      }

      const structuredContent: GetResult = {
        action: "got",
        count: found.length,
        notes: found,
        notFound,
      };

      console.error(`[get:timing] ${(performance.now() - t0Get).toFixed(1)}ms`);
      return { content: [{ type: "text", text: lines.join("\n").trim() }], structuredContent };
    }
  );
}
