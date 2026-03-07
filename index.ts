#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { randomUUID } from "crypto";
import path from "path";

import { Storage, type Note, type RelationshipType } from "./storage.js";
import { embed, cosineSimilarity, embedModel } from "./embeddings.js";
import { GitOps, type SyncResult } from "./git.js";
import { detectProject } from "./project.js";

// ── Config ────────────────────────────────────────────────────────────────────

const VAULT_PATH = process.env["VAULT_PATH"]
  ? path.resolve(process.env["VAULT_PATH"])
  : path.join(process.env["HOME"] ?? "~", "mnemonic-vault");

const DEFAULT_RECALL_LIMIT = 5;
const DEFAULT_MIN_SIMILARITY = 0.3;

// ── Init ──────────────────────────────────────────────────────────────────────

const storage = new Storage(VAULT_PATH);
const git = new GitOps(VAULT_PATH);

await storage.init();
await git.init();

// Write vault .gitignore on first run to keep embeddings local
await ensureVaultGitignore();

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function makeId(title: string): string {
  const slug = slugify(title);
  const suffix = randomUUID().split("-")[0]!;
  return slug ? `${slug}-${suffix}` : suffix;
}

/** Shared project param used by multiple tools */
const projectParam = z
  .string()
  .optional()
  .describe(
    "The working directory of the project (absolute path). " +
    "Pass the cwd of the file/project being worked on. " +
    "Omit for global memories not tied to any project."
  );

async function resolveProject(cwd?: string) {
  if (!cwd) return undefined;
  return detectProject(cwd);
}

function formatNote(note: Note, score?: number): string {
  const scoreStr = score !== undefined ? ` | similarity: ${score.toFixed(3)}` : "";
  const projectStr = note.project ? ` | project: ${note.projectName ?? note.project}` : " | global";
  const relStr = note.relatedTo && note.relatedTo.length > 0
    ? `\n**related:** ${note.relatedTo.map((r) => `\`${r.id}\` (${r.type})`).join(", ")}`
    : "";
  return (
    `## ${note.title}\n` +
    `**id:** \`${note.id}\`${projectStr}${scoreStr}\n` +
    `**tags:** ${note.tags.join(", ") || "none"} | **updated:** ${note.updatedAt}${relStr}\n\n` +
    note.content
  );
}

async function ensureVaultGitignore(): Promise<void> {
  const { promises: fs } = await import("fs");
  const ignorePath = path.join(VAULT_PATH, ".gitignore");
  const line = "embeddings/";
  try {
    const existing = await fs.readFile(ignorePath, "utf-8");
    if (!existing.includes(line)) {
      await fs.writeFile(ignorePath, existing.trimEnd() + "\n" + line + "\n");
    }
  } catch {
    await fs.writeFile(ignorePath, line + "\n");
  }
}

// ── MCP Server ────────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "mnemonic",
  version: "0.2.0",
});

/** Embed any notes missing a local embedding file. Returns counts. */
async function embedMissingNotes(
  noteIds?: string[]
): Promise<{ rebuilt: number; failed: string[] }> {
  const notes = noteIds
    ? (await Promise.all(noteIds.map((id) => storage.readNote(id)))).filter(Boolean) as Note[]
    : await storage.listNotes();

  let rebuilt = 0;
  const failed: string[] = [];

  for (const note of notes) {
    const existing = await storage.readEmbedding(note.id);
    if (existing) continue;
    try {
      const vector = await embed(`${note.title}\n\n${note.content}`);
      await storage.writeEmbedding({
        id: note.id,
        model: embedModel,
        embedding: vector,
        updatedAt: new Date().toISOString(),
      });
      rebuilt++;
    } catch {
      failed.push(note.id);
    }
  }

  return { rebuilt, failed };
}

/** Remove local embedding files for deleted note ids */
async function removeStaleEmbeddings(noteIds: string[]): Promise<void> {
  const { promises: fs } = await import("fs");
  for (const id of noteIds) {
    try {
      await fs.unlink(storage.embeddingPath(id));
    } catch { /* already gone */ }
  }
}


server.registerTool(
  "detect_project",
  {
    title: "Detect Project",
    description:
      "Identify which project a working directory belongs to. " +
      "Returns the stable project id and name. " +
      "Call this to know what project context to pass to other tools.",
    inputSchema: z.object({
      cwd: z.string().describe("Absolute path to the working directory"),
    }),
  },
  async ({ cwd }) => {
    const project = await detectProject(cwd);
    if (!project) {
      return {
        content: [{ type: "text", text: `Could not detect a project for: ${cwd}` }],
      };
    }
    return {
      content: [
        {
          type: "text",
          text:
            `Project detected:\n` +
            `- **id:** \`${project.id}\`\n` +
            `- **name:** ${project.name}\n` +
            `- **source:** ${project.source}`,
        },
      ],
    };
  }
);

// ── remember ──────────────────────────────────────────────────────────────────
server.registerTool(
  "remember",
  {
    title: "Remember",
    description:
      "Store a new memory. Pass `cwd` to associate with a project, or omit for a global memory. " +
      "Writes a markdown note + local embedding, then git commits the note.",
    inputSchema: z.object({
      title: z.string().describe("Short descriptive title"),
      content: z.string().describe("The content to remember (markdown supported)"),
      tags: z.array(z.string()).optional().default([]).describe("Optional tags"),
      cwd: projectParam,
    }),
  },
  async ({ title, content, tags, cwd }) => {
    const project = await resolveProject(cwd);
    const id = makeId(title);
    const now = new Date().toISOString();

    const note: Note = {
      id,
      title,
      content,
      tags,
      project: project?.id,
      projectName: project?.name,
      createdAt: now,
      updatedAt: now,
    };

    await storage.writeNote(note);

    try {
      const vector = await embed(`${title}\n\n${content}`);
      await storage.writeEmbedding({ id, model: embedModel, embedding: vector, updatedAt: now });
    } catch (err) {
      console.error(`[embedding] Skipped for '${id}': ${err}`);
    }

    const scope = project ? `project '${project.name}' (${project.id})` : "global";
    await git.commit(`remember(${scope}): ${title}`, [`notes/${id}.md`]);
    await git.push();

    return {
      content: [
        {
          type: "text",
          text: `Remembered as \`${id}\` [${scope}]`,
        },
      ],
    };
  }
);

// ── recall ────────────────────────────────────────────────────────────────────
server.registerTool(
  "recall",
  {
    title: "Recall",
    description:
      "Semantic search over memories. " +
      "When `cwd` is provided, project memories are scored with a boost and shown first, " +
      "followed by relevant global memories. " +
      "Without `cwd`, searches all memories globally.",
    inputSchema: z.object({
      query: z.string().describe("What to search for"),
      cwd: projectParam,
      limit: z.number().int().min(1).max(20).optional().default(DEFAULT_RECALL_LIMIT),
      minSimilarity: z.number().min(0).max(1).optional().default(DEFAULT_MIN_SIMILARITY),
      tags: z.array(z.string()).optional().describe("Optional tag filter"),
      scope: z
        .enum(["project", "global", "all"])
        .optional()
        .default("all")
        .describe(
          "'project' = only project memories, " +
          "'global' = only unscoped memories, " +
          "'all' = project-boosted then global (default)"
        ),
    }),
  },
  async ({ query, cwd, limit, minSimilarity, tags, scope }) => {
    const project = await resolveProject(cwd);
    const queryVec = await embed(query);
    const embeddings = await storage.listEmbeddings();

    // Build a map of id → note (lazy, load only what we need)
    const noteCache = new Map<string, Note | null>();
    async function getNote(id: string): Promise<Note | null> {
      if (!noteCache.has(id)) {
        noteCache.set(id, await storage.readNote(id));
      }
      return noteCache.get(id) ?? null;
    }

    // Score everything
    const scored: Array<{ id: string; score: number; boosted: number }> = [];
    for (const rec of embeddings) {
      const rawScore = cosineSimilarity(queryVec, rec.embedding);
      if (rawScore < minSimilarity) continue;

      const note = await getNote(rec.id);
      if (!note) continue;

      // Tag filter
      if (tags && tags.length > 0) {
        const noteTags = new Set(note.tags);
        if (!tags.every((t) => noteTags.has(t))) continue;
      }

      // Scope filter
      const isProjectNote = note.project !== undefined;
      const isCurrentProject = project && note.project === project.id;

      if (scope === "project") {
        if (!isCurrentProject) continue;
      } else if (scope === "global") {
        if (isProjectNote) continue;
      }

      // Boost: project notes get +0.15 when searching within project context
      const boost = isCurrentProject ? 0.15 : 0;
      scored.push({ id: rec.id, score: rawScore, boosted: rawScore + boost });
    }

    // Sort by boosted score, take top N
    scored.sort((a, b) => b.boosted - a.boosted);
    const top = scored.slice(0, limit);

    if (top.length === 0) {
      return { content: [{ type: "text", text: "No memories found matching that query." }] };
    }

    const sections: string[] = [];
    for (const { id, score } of top) {
      const note = await getNote(id);
      if (note) sections.push(formatNote(note, score));
    }

    const header = project
      ? `Recall results for project **${project.name}** (scope: ${scope}):`
      : `Recall results (global):`;

    return {
      content: [
        { type: "text", text: `${header}\n\n${sections.join("\n\n---\n\n")}` },
      ],
    };
  }
);

// ── update ────────────────────────────────────────────────────────────────────
server.registerTool(
  "update",
  {
    title: "Update Memory",
    description: "Update the content, title, or tags of an existing memory by id.",
    inputSchema: z.object({
      id: z.string().describe("Memory id to update"),
      content: z.string().optional(),
      title: z.string().optional(),
      tags: z.array(z.string()).optional(),
      cwd: projectParam,
    }),
  },
  async ({ id, content, title, tags, cwd }) => {
    const note = await storage.readNote(id);
    if (!note) {
      return { content: [{ type: "text", text: `No memory found with id '${id}'` }] };
    }

    // Allow re-scoping to a project on update
    const project = await resolveProject(cwd);

    const now = new Date().toISOString();
    const updated: Note = {
      ...note,
      title: title ?? note.title,
      content: content ?? note.content,
      tags: tags ?? note.tags,
      project: project?.id ?? note.project,
      projectName: project?.name ?? note.projectName,
      updatedAt: now,
    };

    await storage.writeNote(updated);

    // Always re-embed — even tag changes affect retrieval context
    try {
      const vector = await embed(`${updated.title}\n\n${updated.content}`);
      await storage.writeEmbedding({ id, model: embedModel, embedding: vector, updatedAt: now });
    } catch (err) {
      console.error(`[embedding] Re-embed failed for '${id}': ${err}`);
    }

    await git.commit(`update: ${updated.title}`, [`notes/${id}.md`]);
    await git.push();

    return { content: [{ type: "text", text: `Updated memory '${id}'` }] };
  }
);

// ── forget ────────────────────────────────────────────────────────────────────
server.registerTool(
  "forget",
  {
    title: "Forget",
    description: "Delete a memory by id.",
    inputSchema: z.object({
      id: z.string().describe("Memory id to delete"),
    }),
  },
  async ({ id }) => {
    const note = await storage.readNote(id);
    if (!note) {
      return { content: [{ type: "text", text: `No memory found with id '${id}'` }] };
    }
    await storage.deleteNote(id);

    // Remove dangling references from other notes
    const allNotes = await storage.listNotes();
    const referencers = allNotes.filter(
      (n) => n.relatedTo?.some((r) => r.id === id)
    );
    for (const ref of referencers) {
      const updated = { ...ref, relatedTo: ref.relatedTo!.filter((r) => r.id !== id) };
      await storage.writeNote(updated);
    }

    const changedFiles = referencers.map((n) => `notes/${n.id}.md`);
    await git.commit(`forget: ${note.title}`, changedFiles);
    await git.push();
    return { content: [{ type: "text", text: `Forgotten '${id}' (${note.title})` }] };
  }
);

// ── list ──────────────────────────────────────────────────────────────────────
server.registerTool(
  "list",
  {
    title: "List Memories",
    description:
      "List stored memories. Pass `cwd` to scope to a project, or omit for all memories.",
    inputSchema: z.object({
      cwd: projectParam,
      scope: z
        .enum(["project", "global", "all"])
        .optional()
        .default("all")
        .describe("'project' = only this project, 'global' = only unscoped, 'all' = everything"),
      tags: z.array(z.string()).optional().describe("Optional tag filter"),
    }),
  },
  async ({ cwd, scope, tags }) => {
    const project = await resolveProject(cwd);

    let filterProject: string | null | undefined = undefined;
    if (scope === "project" && project) {
      filterProject = project.id;
    } else if (scope === "global") {
      filterProject = null;
    }

    let notes = await storage.listNotes(
      filterProject !== undefined ? { project: filterProject } : undefined
    );

    if (tags && tags.length > 0) {
      notes = notes.filter((n) => {
        const s = new Set(n.tags);
        return tags.every((t) => s.has(t));
      });
    }

    // Sort: current project first, then other projects, then global
    notes.sort((a, b) => {
      const aIsCurrentProject = project && a.project === project.id ? 0 : a.project ? 1 : 2;
      const bIsCurrentProject = project && b.project === project.id ? 0 : b.project ? 1 : 2;
      return aIsCurrentProject - bIsCurrentProject || a.title.localeCompare(b.title);
    });

    if (notes.length === 0) {
      return { content: [{ type: "text", text: "No memories found." }] };
    }

    const lines = notes.map((n) => {
      const proj = n.project
        ? `[${n.projectName ?? n.project}]`
        : "[global]";
      const tagStr = n.tags.length > 0 ? ` — ${n.tags.join(", ")}` : "";
      return `- **${n.title}** \`${n.id}\` ${proj}${tagStr}`;
    });

    const header = project && scope !== "global"
      ? `${notes.length} memories (project: ${project.name}, scope: ${scope}):`
      : `${notes.length} memories (scope: ${scope}):`;

    return {
      content: [{ type: "text", text: `${header}\n\n${lines.join("\n")}` }],
    };
  }
);

// ── sync ──────────────────────────────────────────────────────────────────────
server.registerTool(
  "sync",
  {
    title: "Sync",
    description:
      "Bidirectional sync with the git remote: pulls new notes from remote, " +
      "pushes any local commits, then automatically re-embeds any notes that " +
      "arrived or changed during the pull. Safe to run at any time.",
    inputSchema: z.object({}),
  },
  async () => {
    const result: SyncResult = await git.sync();

    if (!result.hasRemote) {
      return {
        content: [{ type: "text", text: "No git remote configured — nothing to sync." }],
      };
    }

    const lines: string[] = [];

    // Report what was pushed
    if (result.pushedCommits > 0) {
      lines.push(`↑ Pushed ${result.pushedCommits} local commit(s) to remote.`);
    } else {
      lines.push("↑ Nothing to push (remote was already up to date).");
    }

    // Handle deletions — remove stale local embeddings
    if (result.deletedNoteIds.length > 0) {
      await removeStaleEmbeddings(result.deletedNoteIds);
      lines.push(`✕ ${result.deletedNoteIds.length} note(s) deleted from remote, local embeddings cleaned up.`);
    }

    // Embed notes that arrived or changed during pull
    if (result.pulledNoteIds.length > 0) {
      lines.push(`↓ ${result.pulledNoteIds.length} note(s) pulled from remote. Embedding...`);
      const { rebuilt, failed } = await embedMissingNotes(result.pulledNoteIds);
      lines.push(`  Embedded ${rebuilt} note(s).${failed.length > 0 ? ` Failed: ${failed.join(", ")}` : ""}`);
    } else {
      lines.push("↓ No new notes from remote.");
    }

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// ── reindex ───────────────────────────────────────────────────────────────────
server.registerTool(
  "reindex",
  {
    title: "Reindex",
    description:
      "Rebuild local embeddings for notes missing an embedding file. " +
      "Normally triggered automatically by sync — only call manually if needed.",
    inputSchema: z.object({
      force: z
        .boolean()
        .optional()
        .default(false)
        .describe("Re-embed ALL notes, even those already indexed"),
    }),
  },
  async ({ force }) => {
    if (force) {
      // Wipe all existing embeddings so embedMissingNotes re-creates them all
      const { promises: fs } = await import("fs");
      const existing = await storage.listEmbeddings();
      for (const rec of existing) {
        try { await fs.unlink(storage.embeddingPath(rec.id)); } catch { /* ok */ }
      }
    }

    const { rebuilt, failed } = await embedMissingNotes();
    const msg =
      `Reindexed ${rebuilt} note(s).` +
      (failed.length > 0 ? ` Failed: ${failed.join(", ")}` : "");
    return { content: [{ type: "text", text: msg }] };
  }
);

// ── get ───────────────────────────────────────────────────────────────────────
server.registerTool(
  "get",
  {
    title: "Get Memories by ID",
    description: "Fetch one or more memories by their exact id. Useful for loading related notes after a recall.",
    inputSchema: z.object({
      ids: z.array(z.string()).min(1).describe("One or more memory ids to fetch"),
    }),
  },
  async ({ ids }) => {
    const sections: string[] = [];
    const missing: string[] = [];
    for (const id of ids) {
      const note = await storage.readNote(id);
      if (note) {
        sections.push(formatNote(note));
      } else {
        missing.push(id);
      }
    }
    const parts: string[] = [];
    if (sections.length > 0) parts.push(sections.join("\n\n---\n\n"));
    if (missing.length > 0) parts.push(`Not found: ${missing.map((id) => `\`${id}\``).join(", ")}`);
    return { content: [{ type: "text", text: parts.join("\n\n") }] };
  }
);

// ── relate ────────────────────────────────────────────────────────────────────
const RELATIONSHIP_TYPES: [RelationshipType, ...RelationshipType[]] = [
  "related-to",
  "explains",
  "example-of",
  "supersedes",
];

server.registerTool(
  "relate",
  {
    title: "Relate Memories",
    description:
      "Create a typed relationship between two memories. " +
      "By default adds the relationship in both directions (fromId → toId and toId → fromId). " +
      "Relationship types: 'related-to' (generic), 'explains' (fromId explains toId), " +
      "'example-of' (fromId is an example of toId), 'supersedes' (fromId supersedes toId).",
    inputSchema: z.object({
      fromId: z.string().describe("The source memory id"),
      toId: z.string().describe("The target memory id"),
      type: z.enum(RELATIONSHIP_TYPES).default("related-to"),
      bidirectional: z
        .boolean()
        .optional()
        .default(true)
        .describe("Also add the reverse edge on toId (default true)"),
    }),
  },
  async ({ fromId, toId, type, bidirectional }) => {
    const [fromNote, toNote] = await Promise.all([
      storage.readNote(fromId),
      storage.readNote(toId),
    ]);
    if (!fromNote) return { content: [{ type: "text", text: `No memory found with id '${fromId}'` }] };
    if (!toNote) return { content: [{ type: "text", text: `No memory found with id '${toId}'` }] };

    const now = new Date().toISOString();
    const changedFiles: string[] = [];

    // Add fromId → toId if not already present
    const fromRels = fromNote.relatedTo ?? [];
    if (!fromRels.some((r) => r.id === toId)) {
      const updated = { ...fromNote, relatedTo: [...fromRels, { id: toId, type }], updatedAt: now };
      await storage.writeNote(updated);
      changedFiles.push(`notes/${fromId}.md`);
    }

    // Add toId → fromId if bidirectional and not already present
    if (bidirectional) {
      const toRels = toNote.relatedTo ?? [];
      if (!toRels.some((r) => r.id === fromId)) {
        const updated = { ...toNote, relatedTo: [...toRels, { id: fromId, type }], updatedAt: now };
        await storage.writeNote(updated);
        changedFiles.push(`notes/${toId}.md`);
      }
    }

    if (changedFiles.length === 0) {
      return { content: [{ type: "text", text: `Relationship already exists between '${fromId}' and '${toId}'` }] };
    }

    await git.commit(`relate(${type}): ${fromNote.title} ↔ ${toNote.title}`, changedFiles);
    await git.push();

    const dirStr = bidirectional ? "↔" : "→";
    return {
      content: [{ type: "text", text: `Linked \`${fromId}\` ${dirStr} \`${toId}\` (${type})` }],
    };
  }
);

// ── unrelate ──────────────────────────────────────────────────────────────────
server.registerTool(
  "unrelate",
  {
    title: "Remove Relationship",
    description: "Remove the relationship between two memories. Removes both directions by default.",
    inputSchema: z.object({
      fromId: z.string().describe("The source memory id"),
      toId: z.string().describe("The target memory id"),
      bidirectional: z.boolean().optional().default(true),
    }),
  },
  async ({ fromId, toId, bidirectional }) => {
    const [fromNote, toNote] = await Promise.all([
      storage.readNote(fromId),
      storage.readNote(toId),
    ]);

    const now = new Date().toISOString();
    const changedFiles: string[] = [];

    if (fromNote) {
      const filtered = (fromNote.relatedTo ?? []).filter((r) => r.id !== toId);
      if (filtered.length !== (fromNote.relatedTo?.length ?? 0)) {
        await storage.writeNote({ ...fromNote, relatedTo: filtered, updatedAt: now });
        changedFiles.push(`notes/${fromId}.md`);
      }
    }

    if (bidirectional && toNote) {
      const filtered = (toNote.relatedTo ?? []).filter((r) => r.id !== fromId);
      if (filtered.length !== (toNote.relatedTo?.length ?? 0)) {
        await storage.writeNote({ ...toNote, relatedTo: filtered, updatedAt: now });
        changedFiles.push(`notes/${toId}.md`);
      }
    }

    if (changedFiles.length === 0) {
      return { content: [{ type: "text", text: `No relationship found between '${fromId}' and '${toId}'` }] };
    }

    await git.commit(`unrelate: ${fromId} ↔ ${toId}`, changedFiles);
    await git.push();
    return { content: [{ type: "text", text: `Removed relationship between \`${fromId}\` and \`${toId}\`` }] };
  }
);

// ── start ─────────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[mnemonic] Started. Vault: ${VAULT_PATH}`);
