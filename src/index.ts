#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { randomUUID } from "crypto";
import path from "path";
import { promises as fs } from "fs";

import { Storage, type Note, type RelationshipType } from "./storage.js";
import { embed, cosineSimilarity, embedModel } from "./embeddings.js";
import { type SyncResult } from "./git.js";
import { cleanMarkdown } from "./markdown.js";
import { detectProject } from "./project.js";
import { VaultManager, type Vault } from "./vault.js";

// ── Config ────────────────────────────────────────────────────────────────────

const VAULT_PATH = process.env["VAULT_PATH"]
  ? path.resolve(process.env["VAULT_PATH"])
  : path.join(process.env["HOME"] ?? "~", "mnemonic-vault");

const DEFAULT_RECALL_LIMIT = 5;
const DEFAULT_MIN_SIMILARITY = 0.3;

// ── Init ──────────────────────────────────────────────────────────────────────

const vaultManager = new VaultManager(VAULT_PATH);
await vaultManager.initMain();

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

async function embedMissingNotes(
  storage: Storage,
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

async function removeStaleEmbeddings(storage: Storage, noteIds: string[]): Promise<void> {
  for (const id of noteIds) {
    try { await fs.unlink(storage.embeddingPath(id)); } catch { /* already gone */ }
  }
}

function formatSyncResult(result: SyncResult, label: string): string[] {
  if (!result.hasRemote) return [`${label}: no remote configured — nothing to sync.`];
  const lines: string[] = [];
  lines.push(result.pushedCommits > 0
    ? `${label}: ↑ pushed ${result.pushedCommits} commit(s).`
    : `${label}: ↑ nothing to push.`);
  if (result.deletedNoteIds.length > 0)
    lines.push(`${label}: ✕ ${result.deletedNoteIds.length} note(s) deleted on remote.`);
  lines.push(result.pulledNoteIds.length > 0
    ? `${label}: ↓ ${result.pulledNoteIds.length} note(s) pulled.`
    : `${label}: ↓ no new notes from remote.`);
  return lines;
}

// ── MCP Server ────────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "mnemonic",
  version: "0.3.0",
});

// ── detect_project ────────────────────────────────────────────────────────────
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
      return { content: [{ type: "text", text: `Could not detect a project for: ${cwd}` }] };
    }
    return {
      content: [{
        type: "text",
        text:
          `Project detected:\n` +
          `- **id:** \`${project.id}\`\n` +
          `- **name:** ${project.name}\n` +
          `- **source:** ${project.source}`,
      }],
    };
  }
);

// ── remember ──────────────────────────────────────────────────────────────────
server.registerTool(
  "remember",
  {
    title: "Remember",
    description:
      "Store a new memory. When `cwd` points to a project, the note is written into " +
      "that project's `.mnemonic/` vault (inside the project repo) so collaborators " +
      "can see it. Omit `cwd` to write a private global memory to the main vault.",
    inputSchema: z.object({
      title: z.string().describe("Short descriptive title"),
      content: z.string().describe("The content to remember (markdown supported)"),
      tags: z.array(z.string()).optional().default([]).describe("Optional tags"),
      cwd: projectParam,
    }),
  },
  async ({ title, content, tags, cwd }) => {
    const project = await resolveProject(cwd);
    const cleanedContent = await cleanMarkdown(content);

    // Route to project vault when cwd is given, fall back to main vault
    const vault = cwd
      ? (await vaultManager.getOrCreateProjectVault(cwd)) ?? vaultManager.main
      : vaultManager.main;

    const id = makeId(title);
    const now = new Date().toISOString();

    const note: Note = {
      id, title, content: cleanedContent, tags,
      project: project?.id,
      projectName: project?.name,
      createdAt: now,
      updatedAt: now,
    };

    await vault.storage.writeNote(note);

    try {
      const vector = await embed(`${title}\n\n${cleanedContent}`);
      await vault.storage.writeEmbedding({ id, model: embedModel, embedding: vector, updatedAt: now });
    } catch (err) {
      console.error(`[embedding] Skipped for '${id}': ${err}`);
    }

    const scope = project ? `project '${project.name}' (${project.id})` : "global";
    await vault.git.commit(
      `remember(${scope}): ${title}`,
      [vaultManager.noteRelPath(vault, id)]
    );
    await vault.git.push();

    const vaultLabel = vault.isProject ? " [project vault]" : " [main vault]";
    return {
      content: [{ type: "text", text: `Remembered as \`${id}\` [${scope}]${vaultLabel}` }],
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
      "When `cwd` is provided, searches both the project vault (.mnemonic/) and the " +
      "main vault — project memories are boosted by +0.15 and shown first. " +
      "Without `cwd`, searches only the main vault.",
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
    const vaults = await vaultManager.searchOrder(cwd);

    const scored: Array<{ id: string; score: number; boosted: number; vault: Vault }> = [];

    for (const vault of vaults) {
      const embeddings = await vault.storage.listEmbeddings();

      for (const rec of embeddings) {
        const rawScore = cosineSimilarity(queryVec, rec.embedding);
        if (rawScore < minSimilarity) continue;

        const note = await vault.storage.readNote(rec.id);
        if (!note) continue;

        if (tags && tags.length > 0) {
          const noteTags = new Set(note.tags);
          if (!tags.every((t) => noteTags.has(t))) continue;
        }

        const isProjectNote = note.project !== undefined;
        const isCurrentProject = project && note.project === project.id;

        if (scope === "project") {
          if (!isCurrentProject) continue;
        } else if (scope === "global") {
          if (isProjectNote) continue;
        }

        const boost = isCurrentProject ? 0.15 : 0;
        scored.push({ id: rec.id, score: rawScore, boosted: rawScore + boost, vault });
      }
    }

    scored.sort((a, b) => b.boosted - a.boosted);
    const top = scored.slice(0, limit);

    if (top.length === 0) {
      return { content: [{ type: "text", text: "No memories found matching that query." }] };
    }

    const sections: string[] = [];
    for (const { id, score, vault } of top) {
      const note = await vault.storage.readNote(id);
      if (note) sections.push(formatNote(note, score));
    }

    const header = project
      ? `Recall results for project **${project.name}** (scope: ${scope}):`
      : `Recall results (global):`;

    return {
      content: [{ type: "text", text: `${header}\n\n${sections.join("\n\n---\n\n")}` }],
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
    const found = await vaultManager.findNote(id, cwd);
    if (!found) {
      return { content: [{ type: "text", text: `No memory found with id '${id}'` }] };
    }

    const { note, vault } = found;
    const project = await resolveProject(cwd);
    const now = new Date().toISOString();
    const cleanedContent = content === undefined ? undefined : await cleanMarkdown(content);

    const updated: Note = {
      ...note,
      title: title ?? note.title,
      content: cleanedContent ?? note.content,
      tags: tags ?? note.tags,
      project: project?.id ?? note.project,
      projectName: project?.name ?? note.projectName,
      updatedAt: now,
    };

    await vault.storage.writeNote(updated);

    try {
      const vector = await embed(`${updated.title}\n\n${updated.content}`);
      await vault.storage.writeEmbedding({ id, model: embedModel, embedding: vector, updatedAt: now });
    } catch (err) {
      console.error(`[embedding] Re-embed failed for '${id}': ${err}`);
    }

    await vault.git.commit(`update: ${updated.title}`, [vaultManager.noteRelPath(vault, id)]);
    await vault.git.push();

    return { content: [{ type: "text", text: `Updated memory '${id}'` }] };
  }
);

// ── forget ────────────────────────────────────────────────────────────────────
server.registerTool(
  "forget",
  {
    title: "Forget",
    description: "Delete a memory by id. Pass `cwd` when targeting project memories from a fresh project-scoped server.",
    inputSchema: z.object({
      id: z.string().describe("Memory id to delete"),
      cwd: projectParam,
    }),
  },
  async ({ id, cwd }) => {
    const found = await vaultManager.findNote(id, cwd);
    if (!found) {
      return { content: [{ type: "text", text: `No memory found with id '${id}'` }] };
    }

    const { note, vault: noteVault } = found;
    await noteVault.storage.deleteNote(id);

    // Clean up dangling references grouped by vault so we make one commit per vault
    const vaultChanges = new Map<Vault, string[]>();

    // Always include the deleted note's path (git add on a deleted file stages the removal)
    const noteVaultFiles = vaultChanges.get(noteVault) ?? [];
    noteVaultFiles.push(vaultManager.noteRelPath(noteVault, id));
    vaultChanges.set(noteVault, noteVaultFiles);

    for (const v of vaultManager.allKnownVaults()) {
      const notes = await v.storage.listNotes();
      const referencers = notes.filter((n) => n.relatedTo?.some((r) => r.id === id));
      for (const ref of referencers) {
        await v.storage.writeNote({ ...ref, relatedTo: ref.relatedTo!.filter((r) => r.id !== id) });
        const files = vaultChanges.get(v) ?? [];
        files.push(vaultManager.noteRelPath(v, ref.id));
        vaultChanges.set(v, files);
      }
    }

    for (const [v, files] of vaultChanges) {
      await v.git.commit(`forget: ${note.title}`, files);
      await v.git.push();
    }

    return { content: [{ type: "text", text: `Forgotten '${id}' (${note.title})` }] };
  }
);

// ── list ──────────────────────────────────────────────────────────────────────
server.registerTool(
  "list",
  {
    title: "List Memories",
    description:
      "List stored memories. Pass `cwd` to include the project vault, or omit for main vault only.",
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
    const vaults = await vaultManager.searchOrder(cwd);

    let filterProject: string | null | undefined = undefined;
    if (scope === "project" && project) filterProject = project.id;
    else if (scope === "global") filterProject = null;

    const seen = new Set<string>();
    let notes: Note[] = [];

    for (const vault of vaults) {
      const vaultNotes = await vault.storage.listNotes(
        filterProject !== undefined ? { project: filterProject } : undefined
      );
      for (const n of vaultNotes) {
        if (!seen.has(n.id)) { seen.add(n.id); notes.push(n); }
      }
    }

    if (tags && tags.length > 0) {
      notes = notes.filter((n) => {
        const s = new Set(n.tags);
        return tags.every((t) => s.has(t));
      });
    }

    notes.sort((a, b) => {
      const aRank = project && a.project === project.id ? 0 : a.project ? 1 : 2;
      const bRank = project && b.project === project.id ? 0 : b.project ? 1 : 2;
      return aRank - bRank || a.title.localeCompare(b.title);
    });

    if (notes.length === 0) {
      return { content: [{ type: "text", text: "No memories found." }] };
    }

    const lines = notes.map((n) => {
      const proj = n.project ? `[${n.projectName ?? n.project}]` : "[global]";
      const tagStr = n.tags.length > 0 ? ` — ${n.tags.join(", ")}` : "";
      return `- **${n.title}** \`${n.id}\` ${proj}${tagStr}`;
    });

    const header = project && scope !== "global"
      ? `${notes.length} memories (project: ${project.name}, scope: ${scope}):`
      : `${notes.length} memories (scope: ${scope}):`;

    return { content: [{ type: "text", text: `${header}\n\n${lines.join("\n")}` }] };
  }
);

// ── sync ──────────────────────────────────────────────────────────────────────
server.registerTool(
  "sync",
  {
    title: "Sync",
    description:
      "Bidirectional git sync. Always syncs the main vault. " +
      "When `cwd` is provided, also syncs the project vault (.mnemonic/) " +
      "so you pull in notes added by collaborators.",
    inputSchema: z.object({
      cwd: projectParam,
    }),
  },
  async ({ cwd }) => {
    const lines: string[] = [];

    // Always sync main vault
    const mainResult = await vaultManager.main.git.sync();
    lines.push(...formatSyncResult(mainResult, "main vault"));
    if (mainResult.pulledNoteIds.length > 0) {
      const { rebuilt, failed } = await embedMissingNotes(vaultManager.main.storage, mainResult.pulledNoteIds);
      lines.push(`main vault: embedded ${rebuilt} note(s).${failed.length > 0 ? ` Failed: ${failed.join(", ")}` : ""}`);
    }
    if (mainResult.deletedNoteIds.length > 0) {
      await removeStaleEmbeddings(vaultManager.main.storage, mainResult.deletedNoteIds);
    }

    // Optionally sync project vault
    if (cwd) {
      const projectVault = await vaultManager.getProjectVaultIfExists(cwd);
      if (projectVault) {
        const projectResult = await projectVault.git.sync();
        lines.push(...formatSyncResult(projectResult, "project vault"));
        if (projectResult.pulledNoteIds.length > 0) {
          const { rebuilt, failed } = await embedMissingNotes(projectVault.storage, projectResult.pulledNoteIds);
          lines.push(`project vault: embedded ${rebuilt} note(s).${failed.length > 0 ? ` Failed: ${failed.join(", ")}` : ""}`);
        }
        if (projectResult.deletedNoteIds.length > 0) {
          await removeStaleEmbeddings(projectVault.storage, projectResult.deletedNoteIds);
        }
      } else {
        lines.push("project vault: no .mnemonic/ found — skipped.");
      }
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
      "Pass `cwd` to also reindex the project vault. `force=true` rebuilds all embeddings.",
    inputSchema: z.object({
      force: z
        .boolean()
        .optional()
        .default(false)
        .describe("Re-embed ALL notes, even those already indexed"),
      cwd: projectParam,
    }),
  },
  async ({ force, cwd }) => {
    const vaults = cwd ? await vaultManager.searchOrder(cwd) : [vaultManager.main];

    let totalRebuilt = 0;
    const allFailed: string[] = [];

    for (const vault of vaults) {
      if (force) {
        const existing = await vault.storage.listEmbeddings();
        for (const rec of existing) {
          try { await fs.unlink(vault.storage.embeddingPath(rec.id)); } catch { /* ok */ }
        }
      }
      const { rebuilt, failed } = await embedMissingNotes(vault.storage);
      totalRebuilt += rebuilt;
      allFailed.push(...failed);
    }

    const msg =
      `Reindexed ${totalRebuilt} note(s).` +
      (allFailed.length > 0 ? ` Failed: ${allFailed.join(", ")}` : "");
    return { content: [{ type: "text", text: msg }] };
  }
);

// ── get ───────────────────────────────────────────────────────────────────────
server.registerTool(
  "get",
  {
    title: "Get Memories by ID",
    description: "Fetch one or more memories by their exact id. Pass `cwd` to include the current project vault.",
    inputSchema: z.object({
      ids: z.array(z.string()).min(1).describe("One or more memory ids to fetch"),
      cwd: projectParam,
    }),
  },
  async ({ ids, cwd }) => {
    const sections: string[] = [];
    const missing: string[] = [];
    for (const id of ids) {
      const found = await vaultManager.findNote(id, cwd);
      if (found) {
        sections.push(formatNote(found.note));
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
      "By default adds the relationship in both directions. " +
      "Notes may be in different vaults — each vault gets its own commit. " +
      "Pass `cwd` to include the current project vault when resolving ids.",
    inputSchema: z.object({
      fromId: z.string().describe("The source memory id"),
      toId: z.string().describe("The target memory id"),
      type: z.enum(RELATIONSHIP_TYPES).default("related-to"),
      bidirectional: z.boolean().optional().default(true),
      cwd: projectParam,
    }),
  },
  async ({ fromId, toId, type, bidirectional, cwd }) => {
    const [foundFrom, foundTo] = await Promise.all([
      vaultManager.findNote(fromId, cwd),
      vaultManager.findNote(toId, cwd),
    ]);
    if (!foundFrom) return { content: [{ type: "text", text: `No memory found with id '${fromId}'` }] };
    if (!foundTo) return { content: [{ type: "text", text: `No memory found with id '${toId}'` }] };

    const { note: fromNote, vault: fromVault } = foundFrom;
    const { note: toNote, vault: toVault } = foundTo;
    const now = new Date().toISOString();

    // Group changes by vault so notes in the same vault share one commit
    const vaultChanges = new Map<Vault, string[]>();

    const fromRels = fromNote.relatedTo ?? [];
    if (!fromRels.some((r) => r.id === toId)) {
      await fromVault.storage.writeNote({ ...fromNote, relatedTo: [...fromRels, { id: toId, type }], updatedAt: now });
      const files = vaultChanges.get(fromVault) ?? [];
      files.push(vaultManager.noteRelPath(fromVault, fromId));
      vaultChanges.set(fromVault, files);
    }

    if (bidirectional) {
      const toRels = toNote.relatedTo ?? [];
      if (!toRels.some((r) => r.id === fromId)) {
        await toVault.storage.writeNote({ ...toNote, relatedTo: [...toRels, { id: fromId, type }], updatedAt: now });
        const files = vaultChanges.get(toVault) ?? [];
        files.push(vaultManager.noteRelPath(toVault, toId));
        vaultChanges.set(toVault, files);
      }
    }

    if (vaultChanges.size === 0) {
      return { content: [{ type: "text", text: `Relationship already exists between '${fromId}' and '${toId}'` }] };
    }

    for (const [vault, files] of vaultChanges) {
      await vault.git.commit(`relate(${type}): ${fromNote.title} ↔ ${toNote.title}`, files);
      await vault.git.push();
    }

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
    description: "Remove the relationship between two memories. Pass `cwd` to include the current project vault.",
    inputSchema: z.object({
      fromId: z.string().describe("The source memory id"),
      toId: z.string().describe("The target memory id"),
      bidirectional: z.boolean().optional().default(true),
      cwd: projectParam,
    }),
  },
  async ({ fromId, toId, bidirectional, cwd }) => {
    const [foundFrom, foundTo] = await Promise.all([
      vaultManager.findNote(fromId, cwd),
      vaultManager.findNote(toId, cwd),
    ]);

    const now = new Date().toISOString();
    const vaultChanges = new Map<Vault, string[]>();

    if (foundFrom) {
      const { note: fromNote, vault: fromVault } = foundFrom;
      const filtered = (fromNote.relatedTo ?? []).filter((r) => r.id !== toId);
      if (filtered.length !== (fromNote.relatedTo?.length ?? 0)) {
        await fromVault.storage.writeNote({ ...fromNote, relatedTo: filtered, updatedAt: now });
        const files = vaultChanges.get(fromVault) ?? [];
        files.push(vaultManager.noteRelPath(fromVault, fromId));
        vaultChanges.set(fromVault, files);
      }
    }

    if (bidirectional && foundTo) {
      const { note: toNote, vault: toVault } = foundTo;
      const filtered = (toNote.relatedTo ?? []).filter((r) => r.id !== fromId);
      if (filtered.length !== (toNote.relatedTo?.length ?? 0)) {
        await toVault.storage.writeNote({ ...toNote, relatedTo: filtered, updatedAt: now });
        const files = vaultChanges.get(toVault) ?? [];
        files.push(vaultManager.noteRelPath(toVault, toId));
        vaultChanges.set(toVault, files);
      }
    }

    if (vaultChanges.size === 0) {
      return { content: [{ type: "text", text: `No relationship found between '${fromId}' and '${toId}'` }] };
    }

    for (const [vault, files] of vaultChanges) {
      await vault.git.commit(`unrelate: ${fromId} ↔ ${toId}`, files);
      await vault.git.push();
    }

    return { content: [{ type: "text", text: `Removed relationship between \`${fromId}\` and \`${toId}\`` }] };
  }
);

// ── start ─────────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[mnemonic] Started. Main vault: ${VAULT_PATH}`);
