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
import {
  PROJECT_POLICY_SCOPES,
  ProjectMemoryPolicyStore,
  WRITE_SCOPES,
  resolveWriteScope,
  type ProjectPolicyScope,
  type WriteScope,
} from "./project-memory-policy.js";
import { classifyTheme, summarizePreview, titleCaseTheme } from "./project-introspection.js";
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
const projectMemoryPolicies = new ProjectMemoryPolicyStore(VAULT_PATH);

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

async function resolveWriteVault(cwd: string | undefined, scope: WriteScope): Promise<Vault> {
  if (scope === "project") {
    return cwd
      ? (await vaultManager.getOrCreateProjectVault(cwd)) ?? vaultManager.main
      : vaultManager.main;
  }

  return vaultManager.main;
}

function describeProject(project: Awaited<ReturnType<typeof resolveProject>>): string {
  return project ? `project '${project.name}' (${project.id})` : "global";
}

async function getProjectPolicyScope(cwd?: string): Promise<ProjectPolicyScope | undefined> {
  const project = await resolveProject(cwd);
  if (!project) {
    return undefined;
  }

  const policy = await projectMemoryPolicies.get(project.id);
  return policy?.defaultScope;
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

function formatAskForWriteScope(project: Awaited<ReturnType<typeof resolveProject>>): string {
  const projectLabel = project ? `${project.name} (${project.id})` : "this context";
  return [
    `Project memory policy for ${projectLabel} is set to always ask.`,
    "Choose where to store this memory and call `remember` again with one of:",
    "- `scope: \"project\"` — shared project vault (`.mnemonic/`)",
    "- `scope: \"global\"` — private main vault with project association",
  ].join("\n");
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

type SearchScope = "project" | "global" | "all";
type StorageScope = "project-vault" | "main-vault" | "any";

type NoteEntry = {
  note: Note;
  vault: Vault;
};

function storageLabel(vault: Vault): string {
  return vault.isProject ? "project-vault" : "main-vault";
}

async function collectVisibleNotes(
  cwd?: string,
  scope: SearchScope = "all",
  tags?: string[],
  storedIn: StorageScope = "any",
): Promise<{ project: Awaited<ReturnType<typeof resolveProject>>; entries: NoteEntry[] }> {
  const project = await resolveProject(cwd);
  const vaults = await vaultManager.searchOrder(cwd);

  let filterProject: string | null | undefined = undefined;
  if (scope === "project" && project) filterProject = project.id;
  else if (scope === "global") filterProject = null;

  const seen = new Set<string>();
  const entries: NoteEntry[] = [];

  for (const vault of vaults) {
    const vaultNotes = await vault.storage.listNotes(
      filterProject !== undefined ? { project: filterProject } : undefined
    );
    for (const note of vaultNotes) {
      if (seen.has(note.id)) {
        continue;
      }
      if (tags && tags.length > 0) {
        const noteTags = new Set(note.tags);
        if (!tags.every((tag) => noteTags.has(tag))) {
          continue;
        }
      }
      if (storedIn !== "any" && storageLabel(vault) !== storedIn) {
        continue;
      }
      seen.add(note.id);
      entries.push({ note, vault });
    }
  }

  entries.sort((a, b) => {
    const aRank = project && a.note.project === project.id ? 0 : a.note.project ? 1 : 2;
    const bRank = project && b.note.project === project.id ? 0 : b.note.project ? 1 : 2;
    return aRank - bRank || a.note.title.localeCompare(b.note.title);
  });

  return { project, entries };
}

function formatListEntry(
  entry: NoteEntry,
  options: { includeRelations?: boolean; includePreview?: boolean; includeStorage?: boolean; includeUpdated?: boolean } = {}
): string {
  const { note, vault } = entry;
  const proj = note.project ? `[${note.projectName ?? note.project}]` : "[global]";
  const extras: string[] = [];
  if (note.tags.length > 0) extras.push(note.tags.join(", "));
  if (options.includeStorage) extras.push(`stored=${storageLabel(vault)}`);
  if (options.includeUpdated) extras.push(`updated=${note.updatedAt}`);
  const lines = [`- **${note.title}** \`${note.id}\` ${proj}${extras.length > 0 ? ` — ${extras.join(" | ")}` : ""}`];
  if (options.includeRelations && note.relatedTo && note.relatedTo.length > 0) {
    lines.push(`  related: ${note.relatedTo.map((rel) => `${rel.id} (${rel.type})`).join(", ")}`);
  }
  if (options.includePreview) {
    lines.push(`  preview: ${summarizePreview(note.content)}`);
  }
  return lines.join("\n");
}

async function formatProjectPolicyLine(projectId?: string): Promise<string> {
  if (!projectId) {
    return "Policy: none";
  }
  const policy = await projectMemoryPolicies.get(projectId);
  if (!policy) {
    return "Policy: none (fallback write scope with cwd is project)";
  }
  return `Policy: default write scope ${policy.defaultScope} (updated ${policy.updatedAt})`;
}

async function moveNoteBetweenVaults(
  found: { note: Note; vault: Vault },
  targetVault: Vault,
): Promise<void> {
  const { note, vault: sourceVault } = found;
  const embedding = await sourceVault.storage.readEmbedding(note.id);

  await targetVault.storage.writeNote(note);
  if (embedding) {
    await targetVault.storage.writeEmbedding(embedding);
  }

  await sourceVault.storage.deleteNote(note.id);

  await targetVault.git.commit(`move: ${note.title}`, [vaultManager.noteRelPath(targetVault, note.id)]);
  await sourceVault.git.commit(`move: ${note.title}`, [vaultManager.noteRelPath(sourceVault, note.id)]);
  await targetVault.git.push();
  if (sourceVault !== targetVault) {
    await sourceVault.git.push();
  }
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
    const policyLine = await formatProjectPolicyLine(project.id);
    return {
      content: [{
        type: "text",
        text:
          `Project detected:\n` +
          `- **id:** \`${project.id}\`\n` +
          `- **name:** ${project.name}\n` +
          `- **source:** ${project.source}\n` +
          `- **${policyLine}**`,
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
      "Store a new memory. `cwd` sets project context. `scope` picks whether the note " +
      "is stored in the shared project vault or the private main vault. When omitted, " +
      "the project's default policy is used before falling back to legacy behavior.",
    inputSchema: z.object({
      title: z.string().describe("Short descriptive title"),
      content: z.string().describe("The content to remember (markdown supported)"),
      tags: z.array(z.string()).optional().default([]).describe("Optional tags"),
      cwd: projectParam,
      scope: z
        .enum(WRITE_SCOPES)
        .optional()
        .describe("Where to store the memory: project vault or private global vault"),
    }),
  },
  async ({ title, content, tags, cwd, scope }) => {
    const project = await resolveProject(cwd);
    const cleanedContent = await cleanMarkdown(content);
    const policyScope = await getProjectPolicyScope(cwd);
    const writeScope = resolveWriteScope(scope, policyScope, Boolean(project));
    if (writeScope === "ask") {
      return { content: [{ type: "text", text: formatAskForWriteScope(project) }] };
    }
    const vault = await resolveWriteVault(cwd, writeScope);

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

    const projectScope = describeProject(project);
    await vault.git.commit(
      `remember(${projectScope}, store=${writeScope}): ${title}`,
      [vaultManager.noteRelPath(vault, id)]
    );
    await vault.git.push();

    const vaultLabel = vault.isProject ? " [project vault]" : " [main vault]";
    return {
      content: [{ type: "text", text: `Remembered as \`${id}\` [${projectScope}, stored=${writeScope}]${vaultLabel}` }],
    };
  }
);

// ── set_project_memory_policy ─────────────────────────────────────────────────
server.registerTool(
  "set_project_memory_policy",
  {
    title: "Set Project Memory Policy",
    description:
      "Choose the default write scope for a project. This lets agents avoid asking " +
      "where to store project-related memories every time.",
    inputSchema: z.object({
      cwd: z.string().describe("Absolute path to the project working directory"),
      defaultScope: z.enum(PROJECT_POLICY_SCOPES).describe("Default storage location for project-related memories"),
    }),
  },
  async ({ cwd, defaultScope }) => {
    const project = await resolveProject(cwd);
    if (!project) {
      return { content: [{ type: "text", text: `Could not detect a project for: ${cwd}` }] };
    }

    const now = new Date().toISOString();
    await projectMemoryPolicies.set({
      projectId: project.id,
      projectName: project.name,
      defaultScope,
      updatedAt: now,
    });

    await vaultManager.main.git.commit(
      `policy(${project.id}): default memory scope ${defaultScope}`,
      ["project-memory-policies.json"]
    );
    await vaultManager.main.git.push();

    return {
      content: [{
        type: "text",
      text: `Project memory policy set for ${project.name}: defaultScope=${defaultScope}`,
      }],
    };
  }
);

// ── get_project_memory_policy ─────────────────────────────────────────────────
server.registerTool(
  "get_project_memory_policy",
  {
    title: "Get Project Memory Policy",
    description: "Show the current default write scope for a project, if one exists.",
    inputSchema: z.object({
      cwd: z.string().describe("Absolute path to the project working directory"),
    }),
  },
  async ({ cwd }) => {
    const project = await resolveProject(cwd);
    if (!project) {
      return { content: [{ type: "text", text: `Could not detect a project for: ${cwd}` }] };
    }

    const policy = await projectMemoryPolicies.get(project.id);
    if (!policy) {
      return {
        content: [{
          type: "text",
          text: `No project memory policy set for ${project.name}. Default write behavior remains scope=project when cwd is present.`,
        }],
      };
    }

    return {
      content: [{
        type: "text",
        text: `Project memory policy for ${project.name}: defaultScope=${policy.defaultScope} (updated ${policy.updatedAt})`,
      }],
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
    description: "Update the content, title, or tags of an existing memory by id. `cwd` helps locate project notes but does not change project metadata.",
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
    const now = new Date().toISOString();
    const cleanedContent = content === undefined ? undefined : await cleanMarkdown(content);

    const updated: Note = {
      ...note,
      title: title ?? note.title,
      content: cleanedContent ?? note.content,
      tags: tags ?? note.tags,
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
      storedIn: z
        .enum(["project-vault", "main-vault", "any"])
        .optional()
        .default("any")
        .describe("Filter by actual storage location instead of project association"),
      tags: z.array(z.string()).optional().describe("Optional tag filter"),
      includeRelations: z.boolean().optional().default(false).describe("Include related memory ids/types"),
      includePreview: z.boolean().optional().default(false).describe("Include a short content preview for each memory"),
      includeStorage: z.boolean().optional().default(false).describe("Include whether the memory lives in the project vault or main vault"),
      includeUpdated: z.boolean().optional().default(false).describe("Include the last updated timestamp for each memory"),
    }),
  },
  async ({ cwd, scope, storedIn, tags, includeRelations, includePreview, includeStorage, includeUpdated }) => {
    const { project, entries } = await collectVisibleNotes(cwd, scope, tags, storedIn);

    if (entries.length === 0) {
      return { content: [{ type: "text", text: "No memories found." }] };
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

    return { content: [{ type: "text", text: `${header}\n\n${lines.join("\n")}` }] };
  }
);

// ── recent_memories ───────────────────────────────────────────────────────────
server.registerTool(
  "recent_memories",
  {
    title: "Recent Memories",
    description: "Show the most recently updated memories for the current project or global vault.",
    inputSchema: z.object({
      cwd: projectParam,
      scope: z.enum(["project", "global", "all"]).optional().default("all"),
      storedIn: z.enum(["project-vault", "main-vault", "any"]).optional().default("any"),
      limit: z.number().int().min(1).max(20).optional().default(5),
      includePreview: z.boolean().optional().default(true),
      includeStorage: z.boolean().optional().default(true),
    }),
  },
  async ({ cwd, scope, storedIn, limit, includePreview, includeStorage }) => {
    const { project, entries } = await collectVisibleNotes(cwd, scope, undefined, storedIn);
    const recent = [...entries]
      .sort((a, b) => b.note.updatedAt.localeCompare(a.note.updatedAt))
      .slice(0, limit);

    if (recent.length === 0) {
      return { content: [{ type: "text", text: "No memories found." }] };
    }

    const header = project && scope !== "global"
      ? `Recent memories for ${project.name}:`
      : "Recent memories:";
    const lines = recent.map((entry) => formatListEntry(entry, {
      includePreview,
      includeStorage,
      includeUpdated: true,
    }));
    return { content: [{ type: "text", text: `${header}\n\n${lines.join("\n")}` }] };
  }
);

// ── memory_graph ──────────────────────────────────────────────────────────────
server.registerTool(
  "memory_graph",
  {
    title: "Memory Graph",
    description: "Show memory relationships for the current project or selected scope as a compact adjacency list.",
    inputSchema: z.object({
      cwd: projectParam,
      scope: z.enum(["project", "global", "all"]).optional().default("all"),
      storedIn: z.enum(["project-vault", "main-vault", "any"]).optional().default("any"),
      limit: z.number().int().min(1).max(50).optional().default(25),
    }),
  },
  async ({ cwd, scope, storedIn, limit }) => {
    const { project, entries } = await collectVisibleNotes(cwd, scope, undefined, storedIn);
    if (entries.length === 0) {
      return { content: [{ type: "text", text: "No memories found." }] };
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
      return { content: [{ type: "text", text: "No relationships found for that scope." }] };
    }

    const header = project && scope !== "global"
      ? `Memory graph for ${project.name}:`
      : "Memory graph:";
    return { content: [{ type: "text", text: `${header}\n\n${lines.join("\n")}` }] };
  }
);

// ── project_memory_summary ────────────────────────────────────────────────────
server.registerTool(
  "project_memory_summary",
  {
    title: "Project Memory Summary",
    description: "Summarize what mnemonic currently knows about a project, including policy, themes, recent changes, and storage layout.",
    inputSchema: z.object({
      cwd: z.string().describe("Absolute path to the project working directory"),
      maxPerTheme: z.number().int().min(1).max(5).optional().default(3),
      recentLimit: z.number().int().min(1).max(10).optional().default(5),
    }),
  },
  async ({ cwd, maxPerTheme, recentLimit }) => {
    const { project, entries } = await collectVisibleNotes(cwd, "all");
    if (!project) {
      return { content: [{ type: "text", text: `Could not detect a project for: ${cwd}` }] };
    }
    if (entries.length === 0) {
      return { content: [{ type: "text", text: `No memories found for project ${project.name}.` }] };
    }

    const policyLine = await formatProjectPolicyLine(project.id);
    const themed = new Map<string, NoteEntry[]>();
    for (const entry of entries) {
      const theme = classifyTheme(entry.note);
      const bucket = themed.get(theme) ?? [];
      bucket.push(entry);
      themed.set(theme, bucket);
    }

    const themeOrder = ["overview", "decisions", "tooling", "bugs", "architecture", "quality", "other"];
    const sections: string[] = [];
    sections.push(`Project memory summary for **${project.name}**`);
    sections.push(`- id: \`${project.id}\``);
    sections.push(`- ${policyLine}`);
    sections.push(`- memories: ${entries.length}`);
    sections.push(`- stored in project vault: ${entries.filter((entry) => entry.vault.isProject).length}`);
    sections.push(`- stored in main vault: ${entries.filter((entry) => !entry.vault.isProject).length}`);
    const mainVaultProjectEntries = entries.filter((entry) => !entry.vault.isProject && entry.note.project === project.id);
    if (mainVaultProjectEntries.length > 0) {
      sections.push(`- private project memories in main vault: ${mainVaultProjectEntries.length}`);
    }

    for (const theme of themeOrder) {
      const bucket = themed.get(theme);
      if (!bucket || bucket.length === 0) {
        continue;
      }
      const top = bucket.slice(0, maxPerTheme);
      sections.push(`\n${titleCaseTheme(theme)}:`);
      sections.push(...top.map((entry) => `- ${entry.note.title} (\`${entry.note.id}\`)`));
    }

    const recent = [...entries]
      .sort((a, b) => b.note.updatedAt.localeCompare(a.note.updatedAt))
      .slice(0, recentLimit);
    sections.push(`\nRecent changes:`);
    sections.push(...recent.map((entry) => `- ${entry.note.updatedAt} — ${entry.note.title}`));

    return { content: [{ type: "text", text: sections.join("\n") }] };
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

// ── where_is_memory ───────────────────────────────────────────────────────────
server.registerTool(
  "where_is_memory",
  {
    title: "Where Is Memory",
    description: "Show a memory's project association and actual storage location.",
    inputSchema: z.object({
      id: z.string().describe("Memory id to inspect"),
      cwd: projectParam,
    }),
  },
  async ({ id, cwd }) => {
    const found = await vaultManager.findNote(id, cwd);
    if (!found) {
      return { content: [{ type: "text", text: `No memory found with id '${id}'` }] };
    }

    const { note, vault } = found;
    const lines = [
      `Memory location for **${note.title}**:`,
      `- id: \`${note.id}\``,
      `- project: ${note.projectName ?? note.project ?? "global"}`,
      `- stored: ${storageLabel(vault)}`,
      `- updated: ${note.updatedAt}`,
    ];
    if (note.relatedTo && note.relatedTo.length > 0) {
      lines.push(`- related: ${note.relatedTo.map((rel) => `${rel.id} (${rel.type})`).join(", ")}`);
    }
    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// ── move_memory ───────────────────────────────────────────────────────────────
server.registerTool(
  "move_memory",
  {
    title: "Move Memory",
    description:
      "Move a memory between the main vault and the current project's vault without changing its id or project metadata.",
    inputSchema: z.object({
      id: z.string().describe("Memory id to move"),
      target: z.enum(["main-vault", "project-vault"]).describe("Destination storage location"),
      cwd: projectParam,
    }),
  },
  async ({ id, target, cwd }) => {
    const found = await vaultManager.findNote(id, cwd);
    if (!found) {
      return { content: [{ type: "text", text: `No memory found with id '${id}'` }] };
    }

    const currentStorage = storageLabel(found.vault);
    if (currentStorage === target) {
      return { content: [{ type: "text", text: `Memory '${id}' is already stored in ${target}.` }] };
    }

    let targetVault: Vault;
    if (target === "main-vault") {
      targetVault = vaultManager.main;
    } else {
      if (!cwd) {
        return {
          content: [{
            type: "text",
            text: "Moving into a project vault requires `cwd` so mnemonic can resolve the destination project.",
          }],
        };
      }
      const projectVault = await vaultManager.getOrCreateProjectVault(cwd);
      if (!projectVault) {
        return { content: [{ type: "text", text: `Could not resolve a project vault for: ${cwd}` }] };
      }
      targetVault = projectVault;
    }

    const existing = await targetVault.storage.readNote(id);
    if (existing) {
      return { content: [{ type: "text", text: `Cannot move '${id}' because a note with that id already exists in ${target}.` }] };
    }

    await moveNoteBetweenVaults(found, targetVault);
    return {
      content: [{
        type: "text",
        text: `Moved '${id}' from ${currentStorage} to ${target}. Project association remains ${found.note.projectName ?? found.note.project ?? "global"}.`,
      }],
    };
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
