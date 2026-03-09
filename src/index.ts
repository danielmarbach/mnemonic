#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { randomUUID } from "crypto";
import path from "path";
import { promises as fs } from "fs";

import { NOTE_LIFECYCLES, Storage, type Note, type NoteLifecycle, type Relationship, type RelationshipType } from "./storage.js";
import { embed, cosineSimilarity, embedModel } from "./embeddings.js";
import { type SyncResult } from "./git.js";

import {
  filterRelationships,
  mergeRelationshipsFromNotes,
  normalizeMergePlanSourceIds,
  resolveEffectiveConsolidationMode,
} from "./consolidate.js";
import { selectRecallResults } from "./recall.js";
import { cleanMarkdown } from "./markdown.js";
import { MnemonicConfigStore, readVaultSchemaVersion } from "./config.js";
import {
  CONSOLIDATION_MODES,
  PROJECT_POLICY_SCOPES,
  WRITE_SCOPES,
  resolveConsolidationMode,
  resolveWriteScope,
  type ConsolidationMode,
  type ProjectMemoryPolicy,
  type ProjectPolicyScope,
  type WriteScope,
} from "./project-memory-policy.js";
import { classifyTheme, summarizePreview, titleCaseTheme } from "./project-introspection.js";
import { detectProject, resolveProjectIdentity, type ProjectIdentityResolution } from "./project.js";
import { VaultManager, type Vault } from "./vault.js";
import { Migrator } from "./migration.js";
import type {
  StructuredResponse,
  RememberResult,
  RecallResult,
  ListResult,
  GetResult,
  UpdateResult,
  ForgetResult,
  MoveResult,
  RelateResult,
  RecentResult,
  WhereIsResult,
  MemoryGraphResult,
  ProjectSummaryResult,
  SyncResult as StructuredSyncResult,
  ReindexResult as StructuredReindexResult,
  PolicyResult,
  ProjectIdentityResult,
  MigrationListResult,
  MigrationExecuteResult,
  ConsolidateResult,
} from "./structured-content.js";

// ── CLI Migration Command ─────────────────────────────────────────────────────

if (process.argv[2] === "migrate") {
  const VAULT_PATH = process.env["VAULT_PATH"]
    ? path.resolve(process.env["VAULT_PATH"])
    : path.join(process.env["HOME"] ?? "~", "mnemonic-vault");

  async function runMigrationCli() {
    const cwd = process.cwd();
    const argv = process.argv.slice(3);
    
    if (argv.includes("--help") || argv.includes("-h")) {
      console.log(`
Mnemonic Migration Tool

Usage:
  mnemonic migrate [options]

Options:
  --dry-run     Show what would change without modifying files (STRONGLY RECOMMENDED)
  --cwd=<path>  Limit migration to specific project vault (/path/to/project)
  --list        Show available migrations and pending count
  --help        Show this help message

Workflow:
  1. Always use --dry-run first to see what will change
  2. Review the output carefully
  3. Run without --dry-run to execute and auto-commit

Examples:
  # Step 1: See what would change
  mnemonic migrate --dry-run
  
  # Step 2: Review, then execute (auto-commits changes)
  mnemonic migrate

  # For a specific project
  mnemonic migrate --dry-run --cwd=/path/to/project
  mnemonic migrate --cwd=/path/to/project
`);
      return;
    }
    
    const dryRun = argv.includes("--dry-run");
    const cwdOption = argv.find(arg => arg.startsWith("--cwd="));
    const targetCwd = cwdOption ? cwdOption.split("=")[1] : undefined;

    const vaultManager = new VaultManager(VAULT_PATH);
    await vaultManager.initMain();
    
    const migrator = new Migrator(vaultManager);

    if (argv.includes("--list")) {
      const migrations = migrator.listAvailableMigrations();
      console.log("Available migrations:");
      migrations.forEach(m => console.log(`  ${m.name}: ${m.description}`));

      console.log("\nVault schema versions:");
      let totalPending = 0;
      for (const vault of vaultManager.allKnownVaults()) {
        const version = await readVaultSchemaVersion(vault.storage.vaultPath);
        const pending = await migrator.getPendingMigrations(version);
        totalPending += pending.length;
        const label = vault.isProject ? "project" : "main";
        console.log(`  ${label} (${vault.storage.vaultPath}): ${version} — ${pending.length} pending`);
      }

      if (dryRun && totalPending > 0) {
        console.log("\n💡 Run without --dry-run to execute these migrations");
        console.log("   Changes will be automatically committed and pushed");
      }
      return;
    }

    if (dryRun) {
      console.log("Running migrations in dry-run mode...");
    } else {
      console.log("⚠️  Executing migrations (changes will be committed and pushed)...");
      console.log("   Use --dry-run first if you want to preview changes\n");
    }

    const { migrationResults, vaultsProcessed } = await migrator.runAllPending(
      { dryRun, cwd: targetCwd }
    );

    for (const [vaultPath, results] of migrationResults) {
      console.log(`\nVault: ${vaultPath}`);
      for (const { migration, result } of results) {
        console.log(`  Migration ${migration}:`);
        console.log(`    Notes processed: ${result.notesProcessed}`);
        console.log(`    Notes modified: ${result.notesModified}`);
        if (!dryRun && result.notesModified > 0) {
          console.log(`    Auto-committed: ${result.warnings.length === 0 ? "✓" : "⚠ (see warnings)"}`);
        }
        if (result.errors.length > 0) {
          console.log(`    Errors: ${result.errors.length}`);
          result.errors.forEach(e => console.log(`      - ${e.noteId}: ${e.error}`));
        }
        if (result.warnings.length > 0) {
          console.log(`    Warnings: ${result.warnings.length}`);
          result.warnings.forEach(w => console.log(`      - ${w}`));
        }
      }
    }
    
    if (!dryRun && vaultsProcessed > 0) {
      console.log("\n✓ Migration completed");
      console.log("Changes have been automatically committed and pushed.");
    } else if (dryRun) {
      console.log("\n✓ Dry-run completed - no changes made");
      if (vaultsProcessed > 0) {
        console.log("\n💡 Ready to execute? Run: mnemonic migrate");
      }
    }
  }

  runMigrationCli().catch(err => {
    console.error("Migration failed:", err);
    process.exit(1);
  });

  // Wait for async operations to complete
  await new Promise(() => {});
}

// ── Config ────────────────────────────────────────────────────────────────────

const VAULT_PATH = process.env["VAULT_PATH"]
  ? path.resolve(process.env["VAULT_PATH"])
  : path.join(process.env["HOME"] ?? "~", "mnemonic-vault");

const DEFAULT_RECALL_LIMIT = 5;
const DEFAULT_MIN_SIMILARITY = 0.3;

async function readPackageVersion(): Promise<string> {
  const packageJsonPath = path.resolve(import.meta.dirname, "../package.json");
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8")) as {
    version?: string;
  };

  return packageJson.version ?? "0.1.0";
}

// ── Init ──────────────────────────────────────────────────────────────────────

const vaultManager = new VaultManager(VAULT_PATH);
await vaultManager.initMain();
const configStore = new MnemonicConfigStore(VAULT_PATH);
const config = await configStore.load();
const migrator = new Migrator(vaultManager);

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
  return detectProject(cwd, {
    getProjectIdentityOverride: async (projectId) => configStore.getProjectIdentityOverride(projectId),
  });
}

async function resolveProjectIdentityForCwd(cwd?: string): Promise<ProjectIdentityResolution | undefined> {
  if (!cwd) return undefined;
  const identity = await resolveProjectIdentity(cwd, {
    getProjectIdentityOverride: async (projectId) => configStore.getProjectIdentityOverride(projectId),
  });
  return identity ?? undefined;
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

function formatProjectIdentityText(identity: ProjectIdentityResolution): string {
  const lines = [
    `Project identity:`,
    `- **id:** \`${identity.project.id}\``,
    `- **name:** ${identity.project.name}`,
    `- **source:** ${identity.project.source}`,
  ];

  if (identity.project.remoteName) {
    lines.push(`- **remote:** ${identity.project.remoteName}`);
  }

  if (identity.identityOverride) {
    const defaultRemote = identity.defaultProject.remoteName ?? "none";
    const status = identity.identityOverrideApplied ? "applied" : "configured, remote unavailable";
    lines.push(`- **identity override:** ${identity.identityOverride.remoteName} (${status}; default remote: ${defaultRemote})`);
    lines.push(`- **default id:** \`${identity.defaultProject.id}\``);
  }

  return lines.join("\n");
}

async function getProjectPolicyScope(cwd?: string): Promise<ProjectPolicyScope | undefined> {
  const project = await resolveProject(cwd);
  if (!project) {
    return undefined;
  }

  const policy = await configStore.getProjectPolicy(project.id);
  return policy?.defaultScope;
}

function describeLifecycle(lifecycle: NoteLifecycle): string {
  return `lifecycle: ${lifecycle}`;
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
    `**tags:** ${note.tags.join(", ") || "none"} | **${describeLifecycle(note.lifecycle)}** | **updated:** ${note.updatedAt}${relStr}\n\n` +
    note.content
  );
}

// ── Git commit message helpers ────────────────────────────────────────────────

/**
 * Extract a short human-readable summary from note content.
 * Returns the first sentence or first 100 chars, whichever is shorter.
 */
function extractSummary(content: string, maxLength = 100): string {
  // Normalize whitespace
  const normalized = content.replace(/\s+/g, " ").trim();

  // Try to find first sentence (ending with .!? followed by space or end)
  const sentenceMatch = normalized.match(/^[^.!?]+[.!?]/);
  if (sentenceMatch) {
    const sentence = sentenceMatch[0].trim();
    if (sentence.length <= maxLength) {
      return sentence;
    }
  }

  // Fallback: first maxLength chars
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return normalized.slice(0, maxLength - 3) + "...";
}

interface CommitBodyOptions {
  noteId?: string;
  noteTitle?: string;
  noteIds?: string[];
  projectName?: string;
  projectId?: string;
  scope?: "project" | "global";
  tags?: string[];
  relationship?: { fromId: string; toId: string; type: string };
  mode?: string;
  count?: number;
  summary?: string;
  description?: string;
}

function formatCommitBody(options: CommitBodyOptions): string {
  const lines: string[] = [];

  // Human-readable summary comes first (like a good commit message)
  if (options.summary) {
    lines.push(options.summary);
    lines.push("");
  }

  // Structured metadata follows
  if (options.noteId && options.noteTitle) {
    lines.push(`- Note: ${options.noteId} (${options.noteTitle})`);
  }

  if (options.noteIds && options.noteIds.length > 0) {
    if (options.noteIds.length === 1 && !options.noteId) {
      lines.push(`- Note: ${options.noteIds[0]}`);
    } else if (options.noteIds.length > 1) {
      lines.push(`- Notes: ${options.noteIds.length} notes affected`);
      options.noteIds.forEach((id) => lines.push(`  - ${id}`));
    }
  }

  if (options.count && !options.noteIds) {
    lines.push(`- Count: ${options.count} items`);
  }

  if (options.projectName) {
    lines.push(`- Project: ${options.projectName}`);
  }

  if (options.scope) {
    lines.push(`- Scope: ${options.scope}`);
  }

  if (options.tags && options.tags.length > 0) {
    lines.push(`- Tags: ${options.tags.join(", ")}`);
  }

  if (options.relationship) {
    lines.push(`- Relationship: ${options.relationship.fromId} ${options.relationship.type} ${options.relationship.toId}`);
  }

  if (options.mode) {
    lines.push(`- Mode: ${options.mode}`);
  }

  if (options.description) {
    lines.push("");
    lines.push(options.description);
  }

  return lines.join("\n");
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
  let index = 0;

  const workerCount = Math.min(config.reindexEmbedConcurrency, Math.max(notes.length, 1));
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const note = notes[index++];
      if (!note) {
        return;
      }

      const existing = await storage.readEmbedding(note.id);
      if (existing?.model === embedModel) {
        continue;
      }

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
  });

  await Promise.all(workers);

  failed.sort();

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
  extras.push(`lifecycle=${note.lifecycle}`);
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
  const policy = await configStore.getProjectPolicy(projectId);
  if (!policy) {
    return "Policy: none (fallback write scope with cwd is project)";
  }
  return `Policy: default write scope ${policy.defaultScope} (updated ${policy.updatedAt})`;
}

async function moveNoteBetweenVaults(
  found: { note: Note; vault: Vault },
  targetVault: Vault,
  noteToWrite?: Note,
): Promise<Note> {
  const { note, vault: sourceVault } = found;
  const finalNote = noteToWrite ?? note;
  const embedding = await sourceVault.storage.readEmbedding(note.id);

  await targetVault.storage.writeNote(finalNote);
  if (embedding) {
    await targetVault.storage.writeEmbedding(embedding);
  }

  await sourceVault.storage.deleteNote(note.id);

  const sourceVaultLabel = sourceVault.isProject ? "project-vault" : "main-vault";
  const targetVaultLabel = targetVault.isProject ? "project-vault" : "main-vault";

  const targetCommitBody = formatCommitBody({
    summary: `Moved from ${sourceVaultLabel} to ${targetVaultLabel}`,
    noteId: finalNote.id,
    noteTitle: finalNote.title,
    projectName: finalNote.projectName,
  });
  await targetVault.git.commit(`move: ${finalNote.title}`, [vaultManager.noteRelPath(targetVault, finalNote.id)], targetCommitBody);

  const sourceCommitBody = formatCommitBody({
    summary: `Moved to ${targetVaultLabel}`,
    noteId: finalNote.id,
    noteTitle: finalNote.title,
    projectName: finalNote.projectName,
  });
  await sourceVault.git.commit(`move: ${finalNote.title}`, [vaultManager.noteRelPath(sourceVault, finalNote.id)], sourceCommitBody);
  await targetVault.git.push();
  if (sourceVault !== targetVault) {
    await sourceVault.git.push();
  }

  return finalNote;
}

async function removeRelationshipsToNoteIds(noteIds: string[]): Promise<Map<Vault, string[]>> {
  const vaultChanges = new Map<Vault, string[]>();

  for (const vault of vaultManager.allKnownVaults()) {
    const notes = await vault.storage.listNotes();
    for (const note of notes) {
      const filtered = filterRelationships(note.relatedTo, noteIds);
      if (filtered === note.relatedTo) {
        continue;
      }

      await vault.storage.writeNote({
        ...note,
        relatedTo: filtered,
      });
      addVaultChange(vaultChanges, vault, vaultManager.noteRelPath(vault, note.id));
    }
  }

  return vaultChanges;
}

function addVaultChange(vaultChanges: Map<Vault, string[]>, vault: Vault, file: string): void {
  const files = vaultChanges.get(vault) ?? [];
  if (!files.includes(file)) {
    files.push(file);
    vaultChanges.set(vault, files);
  }
}

// ── MCP Server ────────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "mnemonic",
  version: await readPackageVersion(),
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
    const identity = await resolveProjectIdentityForCwd(cwd);
    const project = identity?.project;
    if (!project || !identity) {
      return { content: [{ type: "text", text: `Could not detect a project for: ${cwd}` }] };
    }
    const policyLine = await formatProjectPolicyLine(project.id);
    
    const structuredContent: ProjectIdentityResult = {
      action: "project_identity_detected",
      project: {
        id: project.id,
        name: project.name,
        source: project.source,
        remoteName: project.remoteName,
      },
      defaultProject: identity.defaultProject ? {
        id: identity.defaultProject.id,
        name: identity.defaultProject.name,
        remoteName: identity.defaultProject.remoteName,
      } : undefined,
      identityOverride: identity.identityOverride,
    };
    
    return {
      content: [{
        type: "text",
        text:
          `${formatProjectIdentityText(identity)}\n` +
          `- **${policyLine}**`,
      }],
      structuredContent,
    };
  }
);

// ── get_project_identity ───────────────────────────────────────────────────────
server.registerTool(
  "get_project_identity",
  {
    title: "Get Project Identity",
    description:
      "Show the effective project identity for a working directory, including any configured remote override.",
    inputSchema: z.object({
      cwd: z.string().describe("Absolute path to the project working directory"),
    }),
  },
  async ({ cwd }) => {
    const identity = await resolveProjectIdentityForCwd(cwd);
    if (!identity) {
      return { content: [{ type: "text", text: `Could not detect a project for: ${cwd}` }] };
    }

    const structuredContent: ProjectIdentityResult = {
      action: "project_identity_shown",
      project: {
        id: identity.project.id,
        name: identity.project.name,
        source: identity.project.source,
        remoteName: identity.project.remoteName,
      },
      defaultProject: identity.defaultProject ? {
        id: identity.defaultProject.id,
        name: identity.defaultProject.name,
        remoteName: identity.defaultProject.remoteName,
      } : undefined,
      identityOverride: identity.identityOverride,
    };

    return {
      content: [{
        type: "text",
        text: formatProjectIdentityText(identity),
      }],
      structuredContent,
    };
  }
);

// ── set_project_identity ───────────────────────────────────────────────────────
server.registerTool(
  "set_project_identity",
  {
    title: "Set Project Identity",
    description:
      "Override which git remote defines project identity for a repo. Useful for forks that should follow `upstream` instead of `origin`.",
    inputSchema: z.object({
      cwd: z.string().describe("Absolute path to the project working directory"),
      remoteName: z.string().min(1).describe("Git remote name to use as the canonical project identity, such as `upstream`")
    }),
  },
  async ({ cwd, remoteName }) => {
    const defaultIdentity = await resolveProjectIdentity(cwd);
    if (!defaultIdentity) {
      return { content: [{ type: "text", text: `Could not detect a project for: ${cwd}` }] };
    }

    const defaultProject = defaultIdentity.project;
    if (defaultProject.source !== "git-remote") {
      return {
        content: [{
          type: "text",
          text: `Project identity override requires a git remote. Current source: ${defaultProject.source}`,
        }],
      };
    }

    const now = new Date().toISOString();
    const candidateIdentity = await resolveProjectIdentity(cwd, {
      getProjectIdentityOverride: async () => ({ remoteName, updatedAt: now }),
    });

    if (!candidateIdentity || !candidateIdentity.identityOverrideApplied) {
      return {
        content: [{
          type: "text",
          text: `Could not resolve git remote '${remoteName}' for ${defaultProject.name}.`,
        }],
      };
    }

    await configStore.setProjectIdentityOverride(defaultProject.id, { remoteName, updatedAt: now });

    const commitBody = formatCommitBody({
      summary: `Use ${remoteName} as canonical project identity`,
      projectName: defaultProject.name,
      description:
        `Default identity: ${defaultProject.id}\n` +
        `Resolved identity: ${candidateIdentity.project.id}\n` +
        `Remote: ${remoteName}`,
    });
    await vaultManager.main.git.commit(
      `identity: ${defaultProject.name} use remote ${remoteName}`,
      ["config.json"],
      commitBody
    );
    await vaultManager.main.git.push();

    const structuredContent: ProjectIdentityResult = {
      action: "project_identity_set",
      project: {
        id: candidateIdentity.project.id,
        name: candidateIdentity.project.name,
        source: candidateIdentity.project.source,
        remoteName: candidateIdentity.project.remoteName,
      },
      defaultProject: {
        id: defaultProject.id,
        name: defaultProject.name,
        remoteName: defaultProject.remoteName,
      },
      identityOverride: {
        remoteName,
        updatedAt: now,
      },
    };

    return {
      content: [{
        type: "text",
        text:
          `Project identity override set for ${defaultProject.name}: ` +
          `default=\`${defaultProject.id}\`, effective=\`${candidateIdentity.project.id}\`, remote=${remoteName}`,
      }],
      structuredContent,
    };
  }
);

// ── list_migrations ───────────────────────────────────────────────────────────
server.registerTool(
  "list_migrations",
  {
    title: "List Migrations",
    description: "List available migrations and show which ones are pending for the current schema version",
    inputSchema: z.object({}),
  },
  async () => {
    const available = migrator.listAvailableMigrations();
    const lines: string[] = [];

    lines.push("Vault schema versions:");
    let totalPending = 0;
    const vaultsInfo: MigrationListResult["vaults"] = [];
    for (const vault of vaultManager.allKnownVaults()) {
      const version = await readVaultSchemaVersion(vault.storage.vaultPath);
      const pending = await migrator.getPendingMigrations(version);
      totalPending += pending.length;
      const label = vault.isProject ? "project" : "main";
      lines.push(`  ${label} (${vault.storage.vaultPath}): ${version} — ${pending.length} pending`);
      vaultsInfo.push({
        path: vault.storage.vaultPath,
        type: vault.isProject ? "project" : "main",
        version,
        pending: pending.length,
      });
    }

    lines.push("");
    lines.push("Available migrations:");
    for (const migration of available) {
      lines.push(`  ${migration.name}`);
      lines.push(`   ${migration.description}`);
    }

    lines.push("");
    if (totalPending > 0) {
      lines.push("Run migration with: mnemonic migrate (CLI) or execute_migration (MCP)");
    }

    const structuredContent: MigrationListResult = {
      action: "migration_list",
      vaults: vaultsInfo,
      available: available.map(m => ({ name: m.name, description: m.description })),
      totalPending,
    };

    return { content: [{ type: "text", text: lines.join("\n") }], structuredContent };
  }
);

// ── execute_migration ─────────────────────────────────────────────────────────
server.registerTool(
  "execute_migration",
  {
    title: "Execute Migration",
    description: "Execute a named migration on vault notes",
    inputSchema: z.object({
      migrationName: z.string().describe("Name of the migration to execute"),
      dryRun: z.boolean().default(true).describe("If true, show what would change without actually modifying notes"),
      backup: z.boolean().default(true).describe("If true, warn about backing up before real migration"),
      cwd: projectParam.optional().describe("Optional: limit to project vault for given working directory"),
    }),
  },
  async ({ migrationName, dryRun, backup, cwd }) => {
    try {
      const { results, vaultsProcessed } = await migrator.runMigration(migrationName, {
        dryRun,
        backup,
        cwd,
      });
      
      const lines: string[] = [];
      lines.push(`Migration: ${migrationName}`);
      lines.push(`Mode: ${dryRun ? "DRY-RUN" : "EXECUTE"}`);
      lines.push(`Vaults processed: ${vaultsProcessed}`);
      lines.push("")
      
      const vaultResults: Array<{ path: string; notesProcessed: number; notesModified: number; errors: Array<{ noteId: string; error: string }>; warnings: string[] }> = [];
      for (const [vaultPath, result] of results) {
        lines.push(`Vault: ${vaultPath}`);
        lines.push(`  Notes processed: ${result.notesProcessed}`);
        lines.push(`  Notes modified: ${result.notesModified}`);
        
        const vaultResultErrors: Array<{ noteId: string; error: string }> = [];
        const vaultResultWarnings: string[] = [];
        
        if (result.errors.length > 0) {
          lines.push(`  Errors: ${result.errors.length}`);
          result.errors.forEach(e => lines.push(`    - ${e.noteId}: ${e.error}`));
          vaultResultErrors.push(...result.errors.map(e => ({ noteId: e.noteId, error: e.error })));
        }
        
        if (result.warnings.length > 0) {
          lines.push(`  Warnings: ${result.warnings.length}`);
          result.warnings.forEach(w => lines.push(`    - ${w}`));
          vaultResultWarnings.push(...result.warnings);
        }
        
        vaultResults.push({
          path: vaultPath,
          notesProcessed: result.notesProcessed,
          notesModified: result.notesModified,
          errors: vaultResultErrors,
          warnings: vaultResultWarnings,
        });
        lines.push("");
      }
      
      if (!dryRun) {
        lines.push("Migration executed. Modified vaults were auto-committed and pushed when git was available.");
      } else {
        lines.push("✓ Dry-run completed - no changes made");
      }
      
      const structuredContent: MigrationExecuteResult = {
        action: "migration_executed",
        migration: migrationName,
        dryRun,
        vaultsProcessed,
        vaultResults,
      };
      
      return { content: [{ type: "text", text: lines.join("\n") }], structuredContent };
    } catch (err) {
      return {
        content: [{
          type: "text",
          text: `Migration failed: ${err instanceof Error ? err.message : String(err)}`,
        }],
      };
    }
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
      content: z.string().describe("The content to remember (markdown supported; write summary-first with the key fact or decision near the top)"),
      tags: z.array(z.string()).optional().default([]).describe("Optional tags"),
      lifecycle: z
        .enum(NOTE_LIFECYCLES)
        .optional()
        .describe("Whether the note is temporary working-state scaffolding or durable permanent knowledge"),
      summary: z.string().optional().describe("Brief summary for git commit message (like a good commit message, describing the change). Not stored in the note."),
      cwd: projectParam,
      scope: z
        .enum(WRITE_SCOPES)
        .optional()
        .describe("Where to store the memory: project vault or private global vault"),
    }),
  },
  async ({ title, content, tags, lifecycle, summary, cwd, scope }) => {
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
      lifecycle: lifecycle ?? "permanent",
      project: project?.id,
      projectName: project?.name,
      createdAt: now,
      updatedAt: now,
      memoryVersion: 1,
    };

    await vault.storage.writeNote(note);

    try {
      const vector = await embed(`${title}\n\n${cleanedContent}`);
      await vault.storage.writeEmbedding({ id, model: embedModel, embedding: vector, updatedAt: now });
    } catch (err) {
      console.error(`[embedding] Skipped for '${id}': ${err}`);
    }

    const projectScope = describeProject(project);
    const commitSummary = summary ?? extractSummary(cleanedContent);
    const commitBody = formatCommitBody({
      summary: commitSummary,
      noteId: id,
      noteTitle: title,
      projectName: project?.name,
      scope: writeScope,
      tags: tags,
    });
    await vault.git.commit(
      `remember: ${title}`,
      [vaultManager.noteRelPath(vault, id)],
      commitBody
    );
    await vault.git.push();

    const vaultLabel = vault.isProject ? " [project vault]" : " [main vault]";
    const textContent = `Remembered as \`${id}\` [${projectScope}, stored=${writeScope}]${vaultLabel}`;
    
    const structuredContent: RememberResult = {
      action: "remembered",
      id,
      title,
      project: project ? { id: project.id, name: project.name } : undefined,
      scope: writeScope,
      vault: vault.isProject ? "project-vault" : "main-vault",
      tags: tags || [],
      lifecycle: note.lifecycle,
      timestamp: now,
    };
    
    return {
      content: [{ type: "text", text: textContent }],
      structuredContent,
    };
  }
);

// ── set_project_memory_policy ─────────────────────────────────────────────────
server.registerTool(
  "set_project_memory_policy",
  {
    title: "Set Project Memory Policy",
    description:
      "Choose the default write scope and consolidation mode for a project. " +
      "This lets agents avoid asking where to store memories and how to handle consolidation.",
    inputSchema: z.object({
      cwd: z.string().describe("Absolute path to the project working directory"),
      defaultScope: z.enum(PROJECT_POLICY_SCOPES).describe("Default storage location for project-related memories"),
      consolidationMode: z.enum(CONSOLIDATION_MODES).optional().describe(
        "Default consolidation mode: 'supersedes' preserves history (default), 'delete' removes sources"
      ),
    }),
  },
  async ({ cwd, defaultScope, consolidationMode }) => {
    const project = await resolveProject(cwd);
    if (!project) {
      return { content: [{ type: "text", text: `Could not detect a project for: ${cwd}` }] };
    }

    const now = new Date().toISOString();
    const policy: ProjectMemoryPolicy = {
      projectId: project.id,
      projectName: project.name,
      defaultScope,
      consolidationMode,
      updatedAt: now,
    };
    await configStore.setProjectPolicy(policy);

    const modeStr = consolidationMode ? `, consolidationMode=${consolidationMode}` : "";
    const commitBody = formatCommitBody({
      projectName: project.name,
      description: `Default scope: ${defaultScope}${modeStr ? `\nConsolidation mode: ${consolidationMode}` : ""}`,
    });
    await vaultManager.main.git.commit(
      `policy: ${project.name} default scope ${defaultScope}`,
      ["config.json"],
      commitBody
    );
    await vaultManager.main.git.push();

    const structuredContent: PolicyResult = {
      action: "policy_set",
      project: { id: project.id, name: project.name },
      defaultScope,
      consolidationMode,
      timestamp: now,
    };

    return {
      content: [{
        type: "text",
        text: `Project memory policy set for ${project.name}: defaultScope=${defaultScope}${modeStr}`,
      }],
      structuredContent,
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

    const policy = await configStore.getProjectPolicy(project.id);
    if (!policy) {
      const structuredContent: PolicyResult = {
        action: "policy_shown",
        project: { id: project.id, name: project.name },
      };
      return {
        content: [{
          type: "text",
          text: `No project memory policy set for ${project.name}. Default write behavior remains scope=project when cwd is present.`,
        }],
        structuredContent,
      };
    }

    const structuredContent: PolicyResult = {
      action: "policy_shown",
      project: { id: project.id, name: project.name },
      defaultScope: policy.defaultScope,
      consolidationMode: policy.consolidationMode,
      updatedAt: policy.updatedAt,
    };

    return {
      content: [{
        type: "text",
        text: `Project memory policy for ${project.name}: defaultScope=${policy.defaultScope} (updated ${policy.updatedAt})`,
      }],
      structuredContent,
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

    const scored: Array<{ id: string; score: number; boosted: number; vault: Vault; isCurrentProject: boolean }> = [];

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
        scored.push({ id: rec.id, score: rawScore, boosted: rawScore + boost, vault, isCurrentProject: Boolean(isCurrentProject) });
      }
    }

    const top = selectRecallResults(scored, limit, scope);

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

    const textContent = `${header}\n\n${sections.join("\n\n---\n\n")}`;
    
    // Build structured results array
      const structuredResults: Array<{
        id: string;
        title: string;
        score: number;
        boosted: number;
        project?: string;
        projectName?: string;
        vault: "project-vault" | "main-vault";
        tags: string[];
        lifecycle: NoteLifecycle;
        updatedAt: string;
      }> = [];
    for (const { id, score, vault, boosted } of top) {
      const note = await vault.storage.readNote(id);
      if (note) {
        structuredResults.push({
          id,
          title: note.title,
          score,
          boosted,
          project: note.project,
          projectName: note.projectName,
          vault: vault.isProject ? "project-vault" : "main-vault",
          tags: note.tags,
          lifecycle: note.lifecycle,
          updatedAt: note.updatedAt,
        });
      }
    }
    
    const structuredContent: RecallResult = {
      action: "recalled",
      query,
      scope: scope || "all",
      results: structuredResults,
    };

    return {
      content: [{ type: "text", text: textContent }],
      structuredContent,
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
      lifecycle: z
        .enum(NOTE_LIFECYCLES)
        .optional()
        .describe("Set to temporary for working-state notes or permanent for durable knowledge"),
      summary: z.string().optional().describe("Brief summary of what changed and why (for git commit message). Not stored in the note."),
      cwd: projectParam,
    }),
  },
  async ({ id, content, title, tags, lifecycle, summary, cwd }) => {
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
      lifecycle: lifecycle ?? note.lifecycle,
      updatedAt: now,
    };

    await vault.storage.writeNote(updated);

    try {
      const vector = await embed(`${updated.title}\n\n${updated.content}`);
      await vault.storage.writeEmbedding({ id, model: embedModel, embedding: vector, updatedAt: now });
    } catch (err) {
      console.error(`[embedding] Re-embed failed for '${id}': ${err}`);
    }

    // Build change summary (LLM-provided or auto-generated)
    const changes: string[] = [];
    if (title !== undefined && title !== note.title) changes.push("title");
    if (content !== undefined) changes.push("content");
    if (tags !== undefined) changes.push("tags");
    if (lifecycle !== undefined && lifecycle !== note.lifecycle) changes.push("lifecycle");
    const changeDesc = changes.length > 0 ? `Updated ${changes.join(", ")}` : "No changes";
    const commitSummary = summary ?? changeDesc;

    const commitBody = formatCommitBody({
      summary: commitSummary,
      noteId: id,
      noteTitle: updated.title,
      projectName: updated.projectName,
      tags: updated.tags,
    });
    await vault.git.commit(`update: ${updated.title}`, [vaultManager.noteRelPath(vault, id)], commitBody);
    await vault.git.push();

    const structuredContent: UpdateResult = {
      action: "updated",
      id,
      title: updated.title,
      fieldsModified: changes,
      timestamp: now,
      project: updated.project,
      projectName: updated.projectName,
      lifecycle: updated.lifecycle,
    };
    
    return { content: [{ type: "text", text: `Updated memory '${id}'` }], structuredContent };
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
    const vaultChanges = await removeRelationshipsToNoteIds([id]);

    // Always include the deleted note's path (git add on a deleted file stages the removal)
    addVaultChange(vaultChanges, noteVault, vaultManager.noteRelPath(noteVault, id));

    for (const [v, files] of vaultChanges) {
      const isPrimaryVault = v === noteVault;
      const summary = isPrimaryVault ? `Deleted note and cleaned up ${files.length - 1} reference(s)` : "Cleaned up dangling reference";
      const commitBody = formatCommitBody({
        summary,
        noteId: id,
        noteTitle: note.title,
        projectName: note.projectName,
      });
      await v.git.commit(`forget: ${note.title}`, files, commitBody);
      await v.git.push();
    }

    const structuredContent: ForgetResult = {
      action: "forgotten",
      id,
      title: note.title,
      project: note.project,
      projectName: note.projectName,
      relationshipsCleaned: vaultChanges.size > 0 ? Array.from(vaultChanges.values()).reduce((sum, files) => sum + files.length - 1, 0) : 0,
      vaultsModified: Array.from(vaultChanges.keys()).map(v => v.isProject ? "project-vault" : "main-vault"),
    };
    
    return { content: [{ type: "text", text: `Forgotten '${id}' (${note.title})` }], structuredContent };
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

    const textContent = `${header}\n\n${lines.join("\n")}`;
    
    const structuredNotes: Array<{
      id: string;
      title: string;
      project?: string;
      projectName?: string;
      tags: string[];
      lifecycle: NoteLifecycle;
      vault: "project-vault" | "main-vault";
      updatedAt: string;
      hasRelated?: boolean;
    }> = entries.map(({ note, vault }) => ({
      id: note.id,
      title: note.title,
      project: note.project,
      projectName: note.projectName,
      tags: note.tags,
      lifecycle: note.lifecycle,
      vault: vault.isProject ? "project-vault" : "main-vault",
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
    
    const textContent = `${header}\n\n${lines.join("\n")}`;
    
      const structuredNotes = recent.map(({ note, vault }) => ({
        id: note.id,
        title: note.title,
        project: note.project,
        projectName: note.projectName,
        tags: note.tags,
        lifecycle: note.lifecycle,
        vault: vault.isProject ? "project-vault" : "main-vault",
        updatedAt: note.updatedAt,
        preview: includePreview && note.content ? note.content.substring(0, 100) + (note.content.length > 100 ? "..." : "") : undefined,
    }));
    
    const structuredContent: RecentResult = {
      action: "recent_shown",
      project: project?.id,
      projectName: project?.name,
      count: recent.length,
      limit: limit || 5,
      notes: structuredNotes as Array<{
        id: string;
          title: string;
          project?: string;
          projectName?: string;
          tags: string[];
          lifecycle: NoteLifecycle;
          vault: "project-vault" | "main-vault";
          updatedAt: string;
          preview?: string;
      }>,
    };
    
    return { content: [{ type: "text", text: textContent }], structuredContent };
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
    
    const textContent = `${header}\n\n${lines.join("\n")}`;
    
    // Build structured graph
    const structuredNodes = entries
      .filter((entry: NoteEntry) => (entry.note.relatedTo?.length ?? 0) > 0)
      .slice(0, limit)
      .map((entry: NoteEntry) => {
        const edges = (entry.note.relatedTo ?? [])
          .filter((rel: { id: string; type: RelationshipType }) => visibleIds.has(rel.id))
          .map((rel: { id: string; type: RelationshipType }) => ({ toId: rel.id, type: rel.type }));
        return {
          id: entry.note.id,
          title: entry.note.title,
          edges: edges.length > 0 ? edges : [],
        };
      })
      .filter((node: { edges: any[] }) => node.edges.length > 0);
    
    const structuredContent: MemoryGraphResult = {
      action: "graph_shown",
      project: project?.id,
      projectName: project?.name,
      nodes: structuredNodes,
      limit,
      truncated: structuredNodes.length < entries.filter(e => (e.note.relatedTo?.length ?? 0) > 0).length,
    };
    
    return { content: [{ type: "text", text: textContent }], structuredContent };
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
    const projectVaultCount = entries.filter((entry) => entry.vault.isProject).length;
    const mainVaultCount = entries.length - projectVaultCount;
    const sections: string[] = [];
    sections.push(`Project summary: **${project.name}**`);
    sections.push(`- id: \`${project.id}\``);
    sections.push(`- ${policyLine.replace(/^Policy:\s*/, "policy: ")}`);
    sections.push(`- memories: ${entries.length} (project-vault: ${projectVaultCount}, main-vault: ${mainVaultCount})`);
    const mainVaultProjectEntries = entries.filter((entry) => !entry.vault.isProject && entry.note.project === project.id);
    if (mainVaultProjectEntries.length > 0) {
      sections.push(`- private project memories: ${mainVaultProjectEntries.length}`);
    }

    const themes: Array<{ name: string; count: number; examples: string[] }> = [];
    for (const theme of themeOrder) {
      const bucket = themed.get(theme);
      if (!bucket || bucket.length === 0) {
        continue;
      }
      const top = bucket.slice(0, maxPerTheme);
      sections.push(`\n${titleCaseTheme(theme)}:`);
      sections.push(...top.map((entry) => `- ${entry.note.title} (\`${entry.note.id}\`)`));
      
      themes.push({
        name: theme,
        count: bucket.length,
        examples: top.map((entry) => entry.note.title),
      });
    }

    const recent = [...entries]
      .sort((a, b) => b.note.updatedAt.localeCompare(a.note.updatedAt))
      .slice(0, recentLimit);
    sections.push(`\nRecent:`);
    sections.push(...recent.map((entry) => `- ${entry.note.updatedAt} — ${entry.note.title}`));

    const themeCounts: Record<string, number> = {};
    for (const theme of themes) {
      themeCounts[theme.name] = theme.count;
    }

    const structuredContent: ProjectSummaryResult = {
      action: "project_summary_shown",
      project: { id: project.id, name: project.name },
      notes: {
        total: entries.length,
        projectVault: projectVaultCount,
        mainVault: mainVaultCount,
        privateProject: mainVaultProjectEntries.length,
      },
      themes: themeCounts,
      recent: recent.map((entry) => ({
        id: entry.note.id,
        title: entry.note.title,
        updatedAt: entry.note.updatedAt,
      })),
    };

    return { content: [{ type: "text", text: sections.join("\n") }], structuredContent };
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
    const vaultResults: Array<{ vault: "main" | "project"; hasRemote: boolean; pulled: number; deleted: number; pushed: number; embedded: number; failed: string[] }> = [];

    // Always sync main vault
    const mainResult = await vaultManager.main.git.sync();
    lines.push(...formatSyncResult(mainResult, "main vault"));
    let mainEmbedded = 0;
    let mainFailed: string[] = [];
    if (mainResult.pulledNoteIds.length > 0) {
      const { rebuilt, failed } = await embedMissingNotes(vaultManager.main.storage, mainResult.pulledNoteIds);
      mainEmbedded = rebuilt;
      mainFailed = failed;
      lines.push(`main vault: embedded ${rebuilt} note(s).${failed.length > 0 ? ` Failed: ${failed.join(", ")}` : ""}`);
    }
    if (mainResult.deletedNoteIds.length > 0) {
      await removeStaleEmbeddings(vaultManager.main.storage, mainResult.deletedNoteIds);
    }
    vaultResults.push({
      vault: "main",
      hasRemote: mainResult.hasRemote,
      pulled: mainResult.pulledNoteIds.length,
      deleted: mainResult.deletedNoteIds.length,
      pushed: mainResult.pushedCommits,
      embedded: mainEmbedded,
      failed: mainFailed,
    });

    // Optionally sync project vault
    if (cwd) {
      const projectVault = await vaultManager.getProjectVaultIfExists(cwd);
      if (projectVault) {
        const projectResult = await projectVault.git.sync();
        lines.push(...formatSyncResult(projectResult, "project vault"));
        let projEmbedded = 0;
        let projFailed: string[] = [];
        if (projectResult.pulledNoteIds.length > 0) {
          const { rebuilt, failed } = await embedMissingNotes(projectVault.storage, projectResult.pulledNoteIds);
          projEmbedded = rebuilt;
          projFailed = failed;
          lines.push(`project vault: embedded ${rebuilt} note(s).${failed.length > 0 ? ` Failed: ${failed.join(", ")}` : ""}`);
        }
        if (projectResult.deletedNoteIds.length > 0) {
          await removeStaleEmbeddings(projectVault.storage, projectResult.deletedNoteIds);
        }
        vaultResults.push({
          vault: "project",
          hasRemote: projectResult.hasRemote,
          pulled: projectResult.pulledNoteIds.length,
          deleted: projectResult.deletedNoteIds.length,
          pushed: projectResult.pushedCommits,
          embedded: projEmbedded,
          failed: projFailed,
        });
      } else {
        lines.push("project vault: no .mnemonic/ found — skipped.");
      }
    }

    const structuredContent: StructuredSyncResult = {
      action: "synced",
      vaults: vaultResults,
    };
    
    return { content: [{ type: "text", text: lines.join("\n") }], structuredContent };
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
    let targetProject: Awaited<ReturnType<typeof resolveProject>> | undefined;
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
      targetProject = await resolveProject(cwd);
      if (!targetProject) {
        return { content: [{ type: "text", text: `Could not detect a project for: ${cwd}` }] };
      }
      targetVault = projectVault;
    }

    const existing = await targetVault.storage.readNote(id);
    if (existing) {
      return { content: [{ type: "text", text: `Cannot move '${id}' because a note with that id already exists in ${target}.` }] };
    }

    let noteToWrite = found.note;
    let metadataRewritten = false;
    if (target === "project-vault" && targetProject) {
      const rewrittenProject = targetProject.id;
      const rewrittenProjectName = targetProject.name;
      metadataRewritten = noteToWrite.project !== rewrittenProject || noteToWrite.projectName !== rewrittenProjectName;
      noteToWrite = {
        ...noteToWrite,
        project: rewrittenProject,
        projectName: rewrittenProjectName,
        updatedAt: new Date().toISOString(),
      };
    }

    const movedNote = await moveNoteBetweenVaults(found, targetVault, noteToWrite);
    const associationValue = movedNote.projectName && movedNote.project
      ? `${movedNote.projectName} (${movedNote.project})`
      : movedNote.projectName ?? movedNote.project ?? "global";
    
    const structuredContent: MoveResult = {
      action: "moved",
      id,
      fromVault: currentStorage as "project-vault" | "main-vault",
      toVault: target,
      projectAssociation: associationValue,
      title: movedNote.title,
      metadataRewritten,
    };

    const associationText = metadataRewritten
      ? `Project association is now ${associationValue}.`
      : `Project association remains ${associationValue}.`;
    
    return {
      content: [{
        type: "text",
        text: `Moved '${id}' from ${currentStorage} to ${target}. ${associationText}`,
      }],
      structuredContent,
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

    const modifiedNoteIds: string[] = [];
    for (const [vault, files] of vaultChanges) {
      const isFromVault = vault === fromVault;
      const thisNote = isFromVault ? fromNote : toNote;
      const otherNote = isFromVault ? toNote : fromNote;
      const commitBody = formatCommitBody({
        noteId: thisNote.id,
        noteTitle: thisNote.title,
        projectName: thisNote.projectName,
        relationship: {
          fromId: thisNote.id,
          toId: otherNote.id,
          type,
        },
      });
      await vault.git.commit(`relate: ${fromNote.title} ↔ ${toNote.title}`, files, commitBody);
      await vault.git.push();
      modifiedNoteIds.push(...files.map(f => path.basename(f, '.md')));
    }

    const dirStr = bidirectional ? "↔" : "→";
    const structuredContent: RelateResult = {
      action: "related",
      fromId,
      toId,
      type,
      bidirectional,
      notesModified: modifiedNoteIds,
    };
    
    return {
      content: [{ type: "text", text: `Linked \`${fromId}\` ${dirStr} \`${toId}\` (${type})` }],
      structuredContent,
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
      const found = foundFrom?.vault === vault ? foundFrom : foundTo;
      const commitBody = found
        ? formatCommitBody({
            noteId: found.note.id,
            noteTitle: found.note.title,
            projectName: found.note.projectName,
          })
        : undefined;
      await vault.git.commit(`unrelate: ${fromId} ↔ ${toId}`, files, commitBody);
      await vault.git.push();
    }

    const modifiedNoteIds: string[] = [];
    for (const [vault, files] of vaultChanges) {
      modifiedNoteIds.push(...files.map(f => path.basename(f, '.md')));
    }
    
    const structuredContent: RelateResult = {
      action: "unrelated",
      fromId,
      toId,
      type: "related-to", // not tracked for unrelate
      bidirectional,
      notesModified: modifiedNoteIds,
    };
    
    return { content: [{ type: "text", text: `Removed relationship between \`${fromId}\` and \`${toId}\`` }], structuredContent };
  }
);

// ── consolidate ───────────────────────────────────────────────────────────────
server.registerTool(
  "consolidate",
  {
    title: "Consolidate Memories",
    description:
      "Analyze memories for consolidation opportunities or execute merges. " +
      "Strategies that modify data (execute-merge, prune-superseded) require confirmation. " +
      "Cross-vault: gathers notes from both main and project vaults for the detected project.",
    inputSchema: z.object({
      cwd: projectParam,
      strategy: z
        .enum([
          "detect-duplicates",
          "find-clusters",
          "suggest-merges",
          "execute-merge",
          "prune-superseded",
          "dry-run",
        ])
        .describe("Analysis or action to perform"),
      mode: z
        .enum(CONSOLIDATION_MODES)
        .optional()
        .describe("Override the project's default consolidation mode (supersedes or delete)"),
      threshold: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .default(0.85)
        .describe("Similarity threshold for detecting duplicates"),
      mergePlan: z
        .object({
          sourceIds: z.array(z.string()).min(2).describe("Notes to merge into a single consolidated note"),
          targetTitle: z.string().describe("Title for the consolidated note"),
          description: z.string().optional().describe("Optional context explaining the consolidation (stored in note)"),
          summary: z.string().optional().describe("Brief summary of merge rationale (for git commit message only)"),
          tags: z.array(z.string()).optional().describe("Tags for the consolidated note (defaults to union of source tags)"),
        })
        .optional()
        .describe("Required for execute-merge strategy"),
    }),
  },
  async ({ cwd, strategy, mode, threshold, mergePlan }) => {
    const project = await resolveProject(cwd);
    if (!project && cwd) {
      return { content: [{ type: "text", text: `Could not detect a project for: ${cwd}` }] };
    }

    // Gather notes from all vaults (project + main) for this project
    const { entries } = await collectVisibleNotes(cwd, "all", undefined, "any");
    const projectNotes = project
      ? entries.filter((e) => e.note.project === project.id)
      : entries.filter((e) => !e.note.project);

    if (projectNotes.length === 0) {
      return { content: [{ type: "text", text: "No memories found to consolidate." }] };
    }

    // Resolve project/default consolidation mode. Temporary-only merges may still
    // resolve to delete later when a specific source set is known.
    const policy = project ? await configStore.getProjectPolicy(project.id) : undefined;
    const defaultConsolidationMode = resolveConsolidationMode(policy);

    switch (strategy) {
      case "detect-duplicates":
        return detectDuplicates(projectNotes, threshold, project);

      case "find-clusters":
        return findClusters(projectNotes, project);

      case "suggest-merges":
        return suggestMerges(projectNotes, threshold, defaultConsolidationMode, project, mode);

      case "execute-merge":
        if (!mergePlan) {
          return { content: [{ type: "text", text: "execute-merge strategy requires a mergePlan with sourceIds and targetTitle." }] };
        }
        return executeMerge(projectNotes, mergePlan, defaultConsolidationMode, project, cwd, mode);

      case "prune-superseded":
        return pruneSuperseded(projectNotes, mode ?? defaultConsolidationMode, project);

      case "dry-run":
        return dryRunAll(projectNotes, threshold, defaultConsolidationMode, project, mode);

      default:
        return { content: [{ type: "text", text: `Unknown strategy: ${strategy}` }] };
    }
  }
);

// Consolidate helper functions
async function detectDuplicates(
  entries: NoteEntry[],
  threshold: number,
  project: Awaited<ReturnType<typeof resolveProject>>,
): Promise<{ content: Array<{ type: "text"; text: string }>; structuredContent: ConsolidateResult }> {
  const lines: string[] = [];
  lines.push(`Duplicate detection for ${project?.name ?? "global"} (similarity > ${threshold}):`);
  lines.push("");

  const checked = new Set<string>();
  let foundCount = 0;
  const duplicates: Array<{ noteA: { id: string; title: string }; noteB: { id: string; title: string }; similarity: number }> = [];

  for (let i = 0; i < entries.length; i++) {
    const entryA = entries[i]!;
    if (checked.has(entryA.note.id)) continue;

    const embeddingA = await entryA.vault.storage.readEmbedding(entryA.note.id);
    if (!embeddingA) continue;

    for (let j = i + 1; j < entries.length; j++) {
      const entryB = entries[j]!;
      if (checked.has(entryB.note.id)) continue;

      const embeddingB = await entryB.vault.storage.readEmbedding(entryB.note.id);
      if (!embeddingB) continue;

      const similarity = cosineSimilarity(embeddingA.embedding, embeddingB.embedding);
      if (similarity >= threshold) {
        foundCount++;
        lines.push(`${foundCount}. ${entryA.note.title} (${entryA.note.id})`);
        lines.push(`   └── ${entryB.note.title} (${entryB.note.id})`);
        lines.push(`   Similarity: ${similarity.toFixed(3)}`);
        lines.push("");
        checked.add(entryA.note.id);
        checked.add(entryB.note.id);
        
        duplicates.push({
          noteA: { id: entryA.note.id, title: entryA.note.title },
          noteB: { id: entryB.note.id, title: entryB.note.title },
          similarity,
        });
      }
    }
  }

  if (foundCount === 0) {
    lines.push("No duplicates found above the similarity threshold.");
  } else {
    lines.push(`Found ${foundCount} potential duplicate pair(s).`);
    lines.push("Use 'suggest-merges' strategy for actionable recommendations.");
  }

  const structuredContent: ConsolidateResult = {
    action: "consolidated",
    strategy: "detect-duplicates",
    project: project?.id,
    projectName: project?.name,
    notesProcessed: entries.length,
    notesModified: 0,
  };

  return { content: [{ type: "text", text: lines.join("\n") }], structuredContent };
}

function findClusters(
  entries: NoteEntry[],
  project: Awaited<ReturnType<typeof resolveProject>>,
): { content: Array<{ type: "text"; text: string }>; structuredContent: ConsolidateResult } {
  const lines: string[] = [];
  lines.push(`Cluster analysis for ${project?.name ?? "global"}:`);
  lines.push("");

  // Group by theme
  const themed = new Map<string, NoteEntry[]>();
  for (const entry of entries) {
    const theme = classifyTheme(entry.note);
    const bucket = themed.get(theme) ?? [];
    bucket.push(entry);
    themed.set(theme, bucket);
  }

  // Find relationship clusters
  const idToEntry = new Map(entries.map((e) => [e.note.id, e]));
  const visited = new Set<string>();
  const clusters: NoteEntry[][] = [];

  for (const entry of entries) {
    if (visited.has(entry.note.id)) continue;

    const cluster: NoteEntry[] = [];
    const queue = [entry];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current.note.id)) continue;
      visited.add(current.note.id);
      cluster.push(current);

      // Add related notes to queue
      for (const rel of current.note.relatedTo ?? []) {
        const related = idToEntry.get(rel.id);
        if (related && !visited.has(rel.id)) {
          queue.push(related);
        }
      }
    }

    if (cluster.length > 1) {
      clusters.push(cluster);
    }
  }

  // Output theme groups
  const themeGroups: Array<{ name: string; count: number; examples: string[] }> = [];
  lines.push("By Theme:");
  for (const [theme, bucket] of themed) {
    if (bucket.length > 1) {
      lines.push(`  ${titleCaseTheme(theme)} (${bucket.length} notes)`);
      const examples = bucket.slice(0, 3).map((entry) => entry.note.title);
      for (const entry of bucket.slice(0, 3)) {
        lines.push(`    - ${entry.note.title}`);
      }
      if (bucket.length > 3) {
        lines.push(`    ... and ${bucket.length - 3} more`);
      }
      themeGroups.push({ name: theme, count: bucket.length, examples });
    }
  }

  // Output relationship clusters
  const relationshipClusters: Array<{ hub: { id: string; title: string }; notes: { id: string; title: string }[] }> = [];
  if (clusters.length > 0) {
    lines.push("");
    lines.push("Connected Clusters (via relationships):");
    for (let i = 0; i < clusters.length; i++) {
      const cluster = clusters[i]!;
      lines.push(`  Cluster ${i + 1} (${cluster.length} notes):`);
      const hub = cluster.reduce((max, e) =>
        (e.note.relatedTo?.length ?? 0) > (max.note.relatedTo?.length ?? 0) ? e : max
      );
      lines.push(`    Hub: ${hub.note.title}`);
      const clusterNotes: { id: string; title: string }[] = [];
      for (const entry of cluster) {
        if (entry.note.id !== hub.note.id) {
          lines.push(`    - ${entry.note.title}`);
          clusterNotes.push({ id: entry.note.id, title: entry.note.title });
        }
      }
      relationshipClusters.push({
        hub: { id: hub.note.id, title: hub.note.title },
        notes: clusterNotes,
      });
    }
  }

  const structuredContent: ConsolidateResult = {
    action: "consolidated",
    strategy: "find-clusters",
    project: project?.id,
    projectName: project?.name,
    notesProcessed: entries.length,
    notesModified: 0,
  };

  return { content: [{ type: "text", text: lines.join("\n") }], structuredContent };
}

async function suggestMerges(
  entries: NoteEntry[],
  threshold: number,
  defaultConsolidationMode: ConsolidationMode,
  project: Awaited<ReturnType<typeof resolveProject>>,
  explicitMode?: ConsolidationMode,
): Promise<{ content: Array<{ type: "text"; text: string }>; structuredContent: ConsolidateResult }> {
  const lines: string[] = [];
  const modeLabel = explicitMode ?? `${defaultConsolidationMode} (project/default; all-temporary merges auto-delete)`;
  lines.push(`Merge suggestions for ${project?.name ?? "global"} (mode: ${modeLabel}):`);
  lines.push("");

  const checked = new Set<string>();
  let suggestionCount = 0;
  const suggestions: Array<{
    targetTitle: string;
    sourceIds: string[];
    similarities: Array<{ id: string; similarity: number }>;
  }> = [];

  for (let i = 0; i < entries.length; i++) {
    const entryA = entries[i]!;
    if (checked.has(entryA.note.id)) continue;

    const embeddingA = await entryA.vault.storage.readEmbedding(entryA.note.id);
    if (!embeddingA) continue;

    const similar: Array<{ entry: NoteEntry; similarity: number }> = [];

    for (let j = i + 1; j < entries.length; j++) {
      const entryB = entries[j]!;
      if (checked.has(entryB.note.id)) continue;

      const embeddingB = await entryB.vault.storage.readEmbedding(entryB.note.id);
      if (!embeddingB) continue;

      const similarity = cosineSimilarity(embeddingA.embedding, embeddingB.embedding);
      if (similarity >= threshold) {
        similar.push({ entry: entryB, similarity });
      }
    }

    if (similar.length > 0) {
      suggestionCount++;
      similar.sort((a, b) => b.similarity - a.similarity);
      const sources = [entryA, ...similar.map((s) => s.entry)];
      const effectiveMode = resolveEffectiveConsolidationMode(
        sources.map((source) => source.note),
        defaultConsolidationMode,
        explicitMode,
      );

      lines.push(`${suggestionCount}. MERGE ${sources.length} NOTES`);
      lines.push(`   Into: "${entryA.note.title} (consolidated)"`);
      lines.push("   Sources:");
      for (const src of sources) {
        const simStr = src.note.id === entryA.note.id ? "" : ` (${similar.find((s) => s.entry.note.id === src.note.id)?.similarity.toFixed(3)})`;
        lines.push(`     - ${src.note.title} (${src.note.id})${simStr}`);
      }
      const modeDescription = ((): string => {
        switch (effectiveMode) {
          case "supersedes":
            return "preserves history";
          case "delete":
            return "removes sources";
          default: {
            const _exhaustive: never = effectiveMode;
            return _exhaustive;
          }
        }
      })();
      lines.push(`   Mode: ${effectiveMode} (${modeDescription})`);
      lines.push("   To execute:");
      lines.push(`     consolidate({ strategy: "execute-merge", mergePlan: {`);
      lines.push(`       sourceIds: [${sources.map((s) => `"${s.note.id}"`).join(", ")}],`);
      lines.push(`       targetTitle: "${entryA.note.title} (consolidated)"`);
      lines.push(`     }})`);
      lines.push("");

      suggestions.push({
        targetTitle: `${entryA.note.title} (consolidated)`,
        sourceIds: sources.map((s) => s.note.id),
        similarities: similar.map((s) => ({ id: s.entry.note.id, similarity: s.similarity })),
      });

      checked.add(entryA.note.id);
      for (const s of similar) checked.add(s.entry.note.id);
    }
  }

  if (suggestionCount === 0) {
    lines.push("No merge suggestions found. Try lowering the threshold or manual review.");
  } else {
    lines.push(`Generated ${suggestionCount} merge suggestion(s). Review carefully before executing.`);
  }

  const structuredContent: ConsolidateResult = {
    action: "consolidated",
    strategy: "suggest-merges",
    project: project?.id,
    projectName: project?.name,
    notesProcessed: entries.length,
    notesModified: 0,
  };

  return { content: [{ type: "text", text: lines.join("\n") }], structuredContent };
}

async function executeMerge(
  entries: NoteEntry[],
  mergePlan: { sourceIds: string[]; targetTitle: string; description?: string; summary?: string; tags?: string[] },
  defaultConsolidationMode: ConsolidationMode,
  project: Awaited<ReturnType<typeof resolveProject>>,
  cwd?: string,
  explicitMode?: ConsolidationMode,
): Promise<{ content: Array<{ type: "text"; text: string }>; structuredContent: ConsolidateResult }> {
  const sourceIds = normalizeMergePlanSourceIds(mergePlan.sourceIds);
  const targetTitle = mergePlan.targetTitle.trim();
  const { description, summary, tags } = mergePlan;

  if (sourceIds.length < 2) {
    const structuredContent: ConsolidateResult = {
      action: "consolidated",
      strategy: "execute-merge",
      project: project?.id,
      projectName: project?.name,
      notesProcessed: entries.length,
      notesModified: 0,
      warnings: ["execute-merge requires at least two distinct sourceIds."],
    };
    return { content: [{ type: "text", text: "execute-merge requires at least two distinct sourceIds." }], structuredContent };
  }

  if (!targetTitle) {
    const structuredContent: ConsolidateResult = {
      action: "consolidated",
      strategy: "execute-merge",
      project: project?.id,
      projectName: project?.name,
      notesProcessed: entries.length,
      notesModified: 0,
      warnings: ["execute-merge requires a non-empty targetTitle."],
    };
    return { content: [{ type: "text", text: "execute-merge requires a non-empty targetTitle." }], structuredContent };
  }

  // Find all source entries
  const sourceEntries: NoteEntry[] = [];
  for (const id of sourceIds) {
    const entry = entries.find((e) => e.note.id === id);
    if (!entry) {
      const structuredContent: ConsolidateResult = {
        action: "consolidated",
        strategy: "execute-merge",
        project: project?.id,
        projectName: project?.name,
        notesProcessed: entries.length,
        notesModified: 0,
        warnings: [`Source note '${id}' not found.`],
      };
      return { content: [{ type: "text", text: `Source note '${id}' not found.` }], structuredContent };
    }
    sourceEntries.push(entry);
  }

  const consolidationMode = resolveEffectiveConsolidationMode(
    sourceEntries.map((entry) => entry.note),
    defaultConsolidationMode,
    explicitMode,
  );

  const projectVault = cwd ? await vaultManager.getOrCreateProjectVault(cwd) : null;
  const targetVault = projectVault ?? vaultManager.main;
  const now = new Date().toISOString();

  // Build consolidated content
  const sections: string[] = [];
  if (description) {
    sections.push(description);
    sections.push("");
  }
  sections.push("## Consolidated from:");
  for (const entry of sourceEntries) {
    sections.push(`### ${entry.note.title}`);
    sections.push(`*Source: \`${entry.note.id}\`*`);
    sections.push("");
    sections.push(entry.note.content);
    sections.push("");
  }

  // Combine tags (deduplicated)
  const combinedTags = tags ?? Array.from(new Set(sourceEntries.flatMap((e) => e.note.tags)));

  // Collect all unique relationships from sources (excluding relationships among sources)
  const sourceIdsSet = new Set(sourceIds);
  const allRelationships = mergeRelationshipsFromNotes(sourceEntries.map((entry) => entry.note), sourceIdsSet);

  // Create consolidated note
  const targetId = makeId(targetTitle);
  const consolidatedNote: Note = {
    id: targetId,
    title: targetTitle,
    content: sections.join("\n").trim(),
    tags: combinedTags,
    lifecycle: "permanent",
    project: project?.id,
    projectName: project?.name,
    relatedTo: allRelationships,
    createdAt: now,
    updatedAt: now,
  };

  // Write consolidated note
  await targetVault.storage.writeNote(consolidatedNote);

  // Generate embedding for consolidated note
  try {
    const vector = await embed(`${targetTitle}\n\n${consolidatedNote.content}`);
    await targetVault.storage.writeEmbedding({
      id: targetId,
      model: embedModel,
      embedding: vector,
      updatedAt: now,
    });
  } catch (err) {
    console.error(`[embedding] Failed for consolidated note '${targetId}': ${err}`);
  }

  const vaultChanges = new Map<Vault, string[]>();

  // Handle sources based on consolidation mode
  switch (consolidationMode) {
    case "delete": {
      // Delete all sources
      for (const entry of sourceEntries) {
        await entry.vault.storage.deleteNote(entry.note.id);
        addVaultChange(vaultChanges, entry.vault, vaultManager.noteRelPath(entry.vault, entry.note.id));
      }

      const cleanupChanges = await removeRelationshipsToNoteIds(sourceIds);
      for (const [vault, files] of cleanupChanges) {
        for (const file of files) {
          addVaultChange(vaultChanges, vault, file);
        }
      }
      break;
    }
    case "supersedes": {
      // Mark sources with supersedes relationship
      for (const entry of sourceEntries) {
        const updatedRels = [...(entry.note.relatedTo ?? [])];
        if (!updatedRels.some((r) => r.id === targetId)) {
          updatedRels.push({ id: targetId, type: "supersedes" });
        }
        await entry.vault.storage.writeNote({
          ...entry.note,
          relatedTo: updatedRels,
          updatedAt: now,
        });
        addVaultChange(vaultChanges, entry.vault, vaultManager.noteRelPath(entry.vault, entry.note.id));
      }
      break;
    }
    default: {
      const _exhaustive: never = consolidationMode;
      throw new Error(`Unknown consolidation mode: ${_exhaustive}`);
    }
  }

  // Add consolidated note to changes
  addVaultChange(vaultChanges, targetVault, vaultManager.noteRelPath(targetVault, targetId));

  // Commit changes per vault
  for (const [vault, files] of vaultChanges) {
    const isTargetVault = vault === targetVault;

    // Determine action and summary based on mode
    let action: string;
    let sourceSummary: string;
    switch (consolidationMode) {
      case "delete":
        action = "consolidate(delete)";
        sourceSummary = "Deleted as part of consolidation";
        break;
      case "supersedes":
        action = "consolidate(supersedes)";
        sourceSummary = "Marked as superseded by consolidation";
        break;
      default: {
        const _exhaustive: never = consolidationMode;
        throw new Error(`Unknown consolidation mode: ${_exhaustive}`);
      }
    }

    const defaultSummary = `Consolidated ${sourceIds.length} notes into new note`;
    const commitSummary = isTargetVault ? (summary ?? defaultSummary) : sourceSummary;
    const commitBody = isTargetVault
      ? formatCommitBody({
          summary: commitSummary,
          noteId: targetId,
          noteTitle: targetTitle,
          projectName: project?.name,
          mode: consolidationMode,
          noteIds: sourceIds,
          description: `Sources: ${sourceIds.join(", ")}`,
        })
      : formatCommitBody({
          summary: commitSummary,
          noteIds: files.map((f) => f.replace(/\.mnemonic\/notes\/(.+)\.md$/, "$1").replace(/notes\/(.+)\.md$/, "$1")),
        });
    await vault.git.commit(`${action}: ${targetTitle}`, files, commitBody);
    await vault.git.push();
  }

  const lines: string[] = [];
  lines.push(`Consolidated ${sourceIds.length} notes into '${targetId}'`);
  lines.push(`Mode: ${consolidationMode}`);
  lines.push(`Stored in: ${targetVault.isProject ? "project-vault" : "main-vault"}`);

  switch (consolidationMode) {
    case "supersedes":
      lines.push("Sources preserved with 'supersedes' relationship.");
      lines.push("Use 'prune-superseded' later to clean up if desired.");
      break;
    case "delete":
      lines.push("Source notes deleted.");
      break;
    default: {
      const _exhaustive: never = consolidationMode;
      throw new Error(`Unknown consolidation mode: ${_exhaustive}`);
    }
  }

  const structuredContent: ConsolidateResult = {
    action: "consolidated",
    strategy: "execute-merge",
    project: project?.id,
    projectName: project?.name,
    notesProcessed: entries.length,
    notesModified: vaultChanges.size,
  };

  return { content: [{ type: "text", text: lines.join("\n") }], structuredContent };
}

async function pruneSuperseded(
  entries: NoteEntry[],
  consolidationMode: ConsolidationMode,
  project: Awaited<ReturnType<typeof resolveProject>>,
): Promise<{ content: Array<{ type: "text"; text: string }>; structuredContent: ConsolidateResult }> {
  if (consolidationMode !== "delete") {
    const structuredContent: ConsolidateResult = {
      action: "consolidated",
      strategy: "prune-superseded",
      project: project?.id,
      projectName: project?.name,
      notesProcessed: entries.length,
      notesModified: 0,
      warnings: [`prune-superseded requires consolidationMode="delete". Current mode: ${consolidationMode}.`],
    };
    return {
      content: [{
        type: "text",
        text: `prune-superseded requires consolidationMode="delete". Current mode: ${consolidationMode}.\nSet mode explicitly or update project policy.`,
      }],
      structuredContent,
    };
  }

  const lines: string[] = [];
  lines.push(`Pruning superseded notes for ${project?.name ?? "global"}:`);
  lines.push("");

  // Find all notes that have a supersedes relationship pointing to them
  const supersededIds = new Set<string>();
  const supersededBy = new Map<string, string>();

  for (const entry of entries) {
    for (const rel of entry.note.relatedTo ?? []) {
      if (rel.type === "supersedes") {
        supersededIds.add(entry.note.id);
        supersededBy.set(entry.note.id, rel.id);
      }
    }
  }

  if (supersededIds.size === 0) {
    lines.push("No superseded notes found.");
    const structuredContent: ConsolidateResult = {
      action: "consolidated",
      strategy: "prune-superseded",
      project: project?.id,
      projectName: project?.name,
      notesProcessed: entries.length,
      notesModified: 0,
    };
    return { content: [{ type: "text", text: lines.join("\n") }], structuredContent };
  }

  lines.push(`Found ${supersededIds.size} superseded note(s) to prune:`);
  const vaultChanges = new Map<Vault, string[]>();

  for (const id of supersededIds) {
    const entry = entries.find((e) => e.note.id === id);
    if (!entry) continue;

    const targetId = supersededBy.get(id);
    lines.push(`  - ${entry.note.title} (${id}) -> superseded by ${targetId}`);

    await entry.vault.storage.deleteNote(id);
    addVaultChange(vaultChanges, entry.vault, vaultManager.noteRelPath(entry.vault, id));
  }

  const cleanupChanges = await removeRelationshipsToNoteIds(Array.from(supersededIds));
  for (const [vault, files] of cleanupChanges) {
    for (const file of files) {
      addVaultChange(vaultChanges, vault, file);
    }
  }

  // Commit changes per vault
  for (const [vault, files] of vaultChanges) {
    const prunedIds = files.map((f) => f.replace(/\.mnemonic\/notes\/(.+)\.md$/, "$1").replace(/notes\/(.+)\.md$/, "$1"));
    const commitBody = formatCommitBody({
      noteIds: prunedIds,
      description: `Pruned ${prunedIds.length} superseded note(s)\nNotes: ${prunedIds.join(", ")}`,
    });
    await vault.git.commit(`prune: removed ${files.length} superseded note(s)`, files, commitBody);
    await vault.git.push();
  }

  lines.push("");
  lines.push(`Pruned ${supersededIds.size} note(s).`);

  const structuredContent: ConsolidateResult = {
    action: "consolidated",
    strategy: "prune-superseded",
    project: project?.id,
    projectName: project?.name,
    notesProcessed: entries.length,
    notesModified: vaultChanges.size,
  };

  return { content: [{ type: "text", text: lines.join("\n") }], structuredContent };
}

async function dryRunAll(
  entries: NoteEntry[],
  threshold: number,
  defaultConsolidationMode: ConsolidationMode,
  project: Awaited<ReturnType<typeof resolveProject>>,
  explicitMode?: ConsolidationMode,
): Promise<{ content: Array<{ type: "text"; text: string }>; structuredContent: ConsolidateResult }> {
  const lines: string[] = [];
  lines.push(`Consolidation analysis for ${project?.name ?? "global"}:`);
  const modeLabel = explicitMode ?? `${defaultConsolidationMode} (project/default; all-temporary merges auto-delete)`;
  lines.push(`Mode: ${modeLabel} | Threshold: ${threshold}`);
  lines.push("");

  // Run all analysis strategies
  const dupes = await detectDuplicates(entries, threshold, project);
  lines.push("=== DUPLICATE DETECTION ===");
  lines.push(dupes.content[0]?.text ?? "No output");
  lines.push("");

  const clusters = findClusters(entries, project);
  lines.push("=== CLUSTER ANALYSIS ===");
  lines.push(clusters.content[0]?.text ?? "No output");
  lines.push("");

  const merges = await suggestMerges(entries, threshold, defaultConsolidationMode, project, explicitMode);
  lines.push("=== MERGE SUGGESTIONS ===");
  lines.push(merges.content[0]?.text ?? "No output");

  const structuredContent: ConsolidateResult = {
    action: "consolidated",
    strategy: "dry-run",
    project: project?.id,
    projectName: project?.name,
    notesProcessed: entries.length,
    notesModified: 0,
  };

  return { content: [{ type: "text", text: lines.join("\n") }], structuredContent };
}

async function warnAboutPendingMigrationsOnStartup(): Promise<void> {
  let totalPending = 0;
  const details: string[] = [];

  for (const vault of vaultManager.allKnownVaults()) {
    const version = await readVaultSchemaVersion(vault.storage.vaultPath);
    const pending = await migrator.getPendingMigrations(version);
    if (pending.length === 0) {
      continue;
    }

    totalPending += pending.length;
    const label = vault.isProject ? "project" : "main";
    details.push(
      `${label} (${vault.storage.vaultPath}): ${pending.length} pending from schema ${version}`,
    );
  }

  if (totalPending === 0) {
    return;
  }

  console.error(
    `[mnemonic] ${totalPending} pending migration(s) detected - run "mnemonic migrate --dry-run" to preview`,
  );
  for (const detail of details) {
    console.error(`[mnemonic]   ${detail}`);
  }
}

// ── start ─────────────────────────────────────────────────────────────────────
await warnAboutPendingMigrationsOnStartup();
const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[mnemonic] Started. Main vault: ${VAULT_PATH}`);
