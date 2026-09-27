import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { ServerContext } from "../server-context.js";
import { ListResultSchema, type ListResult, type ProjectRef } from "../structured-content.js";
import type { Note, NoteLifecycle } from "../storage.js";
import {
  projectParam,
  ensureBranchSynced,
  noteProjectRef,
  missingCwdHint,
} from "../helpers/project.js";
import { collectVisibleNotes, formatListEntry, storageLabel } from "../helpers/vault.js";

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;
const CURSOR_PREFIX = "offset:";

function encodeCursor(offset: number): string {
  return Buffer.from(`${CURSOR_PREFIX}${offset}`).toString("base64url");
}

function decodeCursor(cursor: string): number | undefined {
  const match = /^offset:(\d+)$/.exec(Buffer.from(cursor, "base64url").toString("utf-8"));
  return match ? Number(match[1]) : undefined;
}

export function registerListTool(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "list",
    {
      title: "List Memories",
      description:
        "Use this when:\n" +
        "- You want to browse what exists for a project or globally\n" +
        "- You want a deterministic filtered list rather than a semantic search\n" +
        "- You are checking inventory before creating, updating, or consolidating notes\n\n" +
        "Do not use this when:\n" +
        "- You want topic-based semantic search; use `recall`\n" +
        "- You already know the exact id; use `get`\n\n" +
        "Returns: one page of matching memories (ids, titles, scope/storage context, metadata), current project first, then other projects, then global, alphabetical by title; count (notes on this page), total (all matches), and nextCursor when more pages exist. Pass nextCursor as cursor to continue.\n\n" +
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
            "'project' = this project's memories and attached vault notes; " +
              "'global' = only unscoped memories (main/global storage); " +
              "'all' = everything visible from this context (default)",
          ),
        storedIn: z
          .enum(["project-vault", "main-vault", "any", "attached"])
          .optional()
          .default("any")
          .describe(
            "Storage-label filter. Use `main-vault` for main/global storage. " +
              "Use `project-vault` as the broad filter for any project vault, including sub-vaults. " +
              "Use `attached` for notes from attached external repositories only. " +
              "Results may still return a more specific label such as `sub-vault:.mnemonic-lib`.",
          ),
        tags: z
          .array(z.string())
          .optional()
          .describe("Filter to notes matching all of these tags."),
        includeRelations: z
          .boolean()
          .optional()
          .default(false)
          .describe("Include related memory ids and relationship types"),
        includePreview: z
          .boolean()
          .optional()
          .default(false)
          .describe("Include a short content preview for each note"),
        includeStorage: z
          .boolean()
          .optional()
          .default(false)
          .describe("Show which vault each note is stored in"),
        includeUpdated: z
          .boolean()
          .optional()
          .default(false)
          .describe("Include last-updated timestamp for each note"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_LIST_LIMIT)
          .optional()
          .default(DEFAULT_LIST_LIMIT)
          .describe(
            `Maximum notes per page (default ${DEFAULT_LIST_LIMIT}, max ${MAX_LIST_LIMIT}). Use recall for topic search instead of paging through everything.`,
          ),
        cursor: z
          .string()
          .optional()
          .describe("Opaque nextCursor from a previous list call with the same filters."),
      }),
      outputSchema: ListResultSchema,
    },
    async ({
      cwd,
      scope,
      storedIn,
      tags,
      includeRelations,
      includePreview,
      includeStorage,
      includeUpdated,
      limit,
      cursor,
    }) => {
      await ensureBranchSynced(ctx, cwd);

      const offset = cursor === undefined ? 0 : decodeCursor(cursor);
      if (offset === undefined) {
        return {
          content: [
            {
              type: "text",
              text: "Invalid cursor. Call list again without cursor to start from the first page.",
            },
          ],
          isError: true,
        };
      }

      const { project, entries } = await collectVisibleNotes(ctx, cwd, scope, tags, storedIn);

      if (entries.length === 0) {
        const structuredContent: ListResult = {
          action: "listed",
          count: 0,
          scope: scope || "all",
          storedIn: storedIn || "any",
          project: project ? { id: project.id, name: project.name } : undefined,
          total: 0,
          notes: [],
        };
        return {
          content: [{ type: "text", text: `No memories found.${missingCwdHint(cwd)}` }],
          structuredContent,
        };
      }

      const total = entries.length;
      const page = entries.slice(offset, offset + limit);
      const nextOffset = offset + page.length;
      const nextCursor = nextOffset < total ? encodeCursor(nextOffset) : undefined;

      const lines = page.map((entry) =>
        formatListEntry(entry, {
          includeRelations,
          includePreview,
          includeStorage,
          includeUpdated,
        }),
      );

      const header =
        project && scope !== "global"
          ? `${total} memories (project: ${project.name}, scope: ${scope}, storedIn: ${storedIn}):`
          : `${total} memories (scope: ${scope}, storedIn: ${storedIn}):`;
      const pageLine =
        page.length === 0
          ? `\nno notes on this page: the cursor is past the last of ${total}`
          : page.length < total
            ? `\nshowing ${offset + 1}-${nextOffset} of ${total}`
            : "";
      const moreLine = nextCursor
        ? `\n\nMore: call list again with the same filters and cursor: "${nextCursor}"`
        : "";

      const textContent = `${header}${pageLine}\n\n${lines.join("\n")}${moreLine}${missingCwdHint(cwd)}`;

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
      }> = page.map(({ note, vault }) => ({
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
        count: page.length,
        total,
        nextCursor,
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
    },
  );
}
