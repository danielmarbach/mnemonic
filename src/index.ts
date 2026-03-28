#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { randomUUID } from "crypto";
import path from "path";
import { promises as fs } from "fs";

import { NOTE_LIFECYCLES, Storage, type Note, type NoteLifecycle, type Relationship, type RelationshipType } from "./storage.js";
import { embed, cosineSimilarity, embedModel } from "./embeddings.js";
import { type CommitResult, type PushResult, type SyncResult } from "./git.js";
import { buildTemporalHistoryEntry, computeConfidence, getNoteProvenance } from "./provenance.js";
import { getOrBuildProjection } from "./projections.js";
import {
  invalidateActiveProjectCache,
  getOrBuildVaultEmbeddings,
  getOrBuildVaultNoteList,
  getSessionCachedNote,
} from "./cache.js";
import { performance } from "perf_hooks";

import {
  filterRelationships,
  mergeRelationshipsFromNotes,
  normalizeMergePlanSourceIds,
  resolveEffectiveConsolidationMode,
} from "./consolidate.js";
import { computeRecallMetadataBoost, selectRecallResults } from "./recall.js";
import { getRelationshipPreview } from "./relationships.js";
import { cleanMarkdown } from "./markdown.js";
import { MnemonicConfigStore, readVaultSchemaVersion, type MutationPushMode } from "./config.js";
import {
  CONSOLIDATION_MODES,
  PROTECTED_BRANCH_BEHAVIORS,
  PROJECT_POLICY_SCOPES,
  WRITE_SCOPES,
  isProtectedBranch,
  resolveProtectedBranchBehavior,
  resolveProtectedBranchPatterns,
  resolveConsolidationMode,
  resolveWriteScope,
  type ConsolidationMode,
  type ProjectMemoryPolicy,
  type WriteScope,
} from "./project-memory-policy.js";
import {
  classifyTheme,
  classifyThemeWithGraduation,
  computeThemesWithGraduation,
  summarizePreview,
  titleCaseTheme,
  daysSinceUpdate,
  recencyScore,
  withinThemeScore,
  anchorScore,
  computeConnectionDiversity,
} from "./project-introspection.js";
import { getEffectiveMetadata } from "./role-suggestions.js";
import { detectProject, getCurrentGitBranch, resolveProjectIdentity, type ProjectIdentityResolution } from "./project.js";
import { VaultManager, type Vault } from "./vault.js";
import { checkBranchChange } from "./branch-tracker.js";
import { Migrator } from "./migration.js";
import { parseMemorySections } from "./import.js";
import { defaultClaudeHome, defaultVaultPath, resolveUserPath } from "./paths.js";
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
  PolicyResult,
  ProjectIdentityResult,
  MigrationListResult,
  MigrationExecuteResult,
  ConsolidateResult,
  PersistenceStatus,
  MutationRetryContract,
  DiscoverTagsResult,
  ThemeSection,
  AnchorNote,
  RelationshipPreview,
} from "./structured-content.js";
import {
  RememberResultSchema,
  RecallResultSchema,
  ListResultSchema,
  GetResultSchema,
  UpdateResultSchema,
  ForgetResultSchema,
  MoveResultSchema,
  RelateResultSchema,
  RecentResultSchema,
  MemoryGraphResultSchema,
  ProjectSummaryResultSchema,
  SyncResultSchema,
  WhereIsResultSchema,
  ConsolidateResultSchema,
  ProjectIdentityResultSchema,
  MigrationListResultSchema,
  MigrationExecuteResultSchema,
  PolicyResultSchema,
  DiscoverTagsResultSchema,
} from "./structured-content.js";

// ── CLI Migration Command ─────────────────────────────────────────────────────

if (process.argv[2] === "migrate") {
  const VAULT_PATH = process.env["VAULT_PATH"]
    ? resolveUserPath(process.env["VAULT_PATH"])
    : defaultVaultPath();

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
      process.exit(0);
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

  await runMigrationCli().catch(err => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
  process.exit(0);
}

// ── CLI: import-claude-memory ─────────────────────────────────────────────────

if (process.argv[2] === "import-claude-memory") {
  const VAULT_PATH = process.env["VAULT_PATH"]
    ? resolveUserPath(process.env["VAULT_PATH"])
    : defaultVaultPath();

  const CLAUDE_HOME = process.env["CLAUDE_HOME"]
    ? resolveUserPath(process.env["CLAUDE_HOME"])
    : defaultClaudeHome();

  function makeImportNoteId(title: string): string {
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
    const suffix = randomUUID().split("-")[0]!;
    return slug ? `${slug}-${suffix}` : suffix;
  }

  async function runImportCli() {
    const argv = process.argv.slice(3);

    if (argv.includes("--help") || argv.includes("-h")) {
      console.log(`
Mnemonic: Import Claude Code Auto-Memory

Usage:
  mnemonic import-claude-memory [options]

Options:
  --dry-run         Show what would be imported without writing anything
  --cwd=<path>      Project path to resolve Claude memory for (default: cwd)
  --claude-home=<p> Claude home directory (default: ~/.claude, or $CLAUDE_HOME)
  --help            Show this help message

How it works:
  Claude Code stores per-project auto-memory in:
    ~/.claude/projects/<encoded-path>/memory/*.md

  Each ## heading in those files becomes a separate mnemonic note
  tagged with "claude-memory" and "imported". Notes with duplicate
  titles are skipped.

Examples:
  mnemonic import-claude-memory --dry-run
  mnemonic import-claude-memory
  mnemonic import-claude-memory --cwd=/path/to/project
`);
      process.exit(0);
    }

    const dryRun = argv.includes("--dry-run");
    const cwdOption = argv.find(arg => arg.startsWith("--cwd="));
    const targetCwd = cwdOption ? resolveUserPath(cwdOption.split("=")[1]!) : process.cwd();
    const claudeHomeOption = argv.find(arg => arg.startsWith("--claude-home="));
    const claudeHome = claudeHomeOption ? resolveUserPath(claudeHomeOption.split("=")[1]!) : CLAUDE_HOME;

    // Encode the project path the same way Claude Code does:
    // /Users/foo/Projects/bar → -Users-foo-Projects-bar
    // On Windows both \ and / are replaced with -
    const projectDirName = targetCwd.replace(/[/\\]/g, "-");
    const memoryDir = path.join(claudeHome, "projects", projectDirName, "memory");

    try {
      await fs.access(memoryDir);
    } catch {
      console.log(`No Claude memory found for this project.`);
      console.log(`Expected: ${memoryDir}`);
      process.exit(0);
    }

    const files = (await fs.readdir(memoryDir)).filter(f => f.endsWith(".md")).sort();
    if (files.length === 0) {
      console.log("No markdown files found in Claude memory directory.");
      process.exit(0);
    }

    console.log(`Found ${files.length} file(s) in ${memoryDir}`);

    const vaultManager = new VaultManager(VAULT_PATH);
    await vaultManager.initMain();
    const vault = vaultManager.main;

    const existingNotes = await vault.storage.listNotes();
    const existingTitles = new Set(existingNotes.map(n => n.title.toLowerCase()));

    const now = new Date().toISOString();
    const notesToWrite: import("./storage.js").Note[] = [];
    const skipped: string[] = [];

    for (const file of files) {
      const raw = await fs.readFile(path.join(memoryDir, file), "utf-8");
      const sections = parseMemorySections(raw);
      const sourceTag = file.replace(/\.md$/i, "").toLowerCase().replace(/[^a-z0-9]+/g, "-");

      for (const section of sections) {
        if (existingTitles.has(section.title.toLowerCase())) {
          skipped.push(section.title);
          continue;
        }

        notesToWrite.push({
          id: makeImportNoteId(section.title),
          title: section.title,
          content: section.content,
          tags: ["claude-memory", "imported", sourceTag],
          lifecycle: "permanent",
          createdAt: now,
          updatedAt: now,
          memoryVersion: 1,
        });
      }
    }

    if (skipped.length > 0) {
      console.log(`\nSkipped (title already exists in vault):`);
      skipped.forEach(t => console.log(`  ~ ${t}`));
    }

    if (notesToWrite.length === 0) {
      console.log("\nNothing new to import.");
      process.exit(0);
    }

    console.log(`\nSections to import (${notesToWrite.length}):`);
    notesToWrite.forEach(n => console.log(`  + ${n.title}`));

    if (dryRun) {
      console.log("\n✓ Dry-run complete — no changes written");
      process.exit(0);
    }

    const filesToCommit: string[] = [];
    for (const note of notesToWrite) {
      await vault.storage.writeNote(note);
      filesToCommit.push(`notes/${note.id}.md`);
    }

    const commitMessage = [
      `import: claude-memory (${notesToWrite.length} note${notesToWrite.length === 1 ? "" : "s"})`,
      "",
      `- Notes: ${notesToWrite.length}`,
      `- Source: ${memoryDir}`,
      `- Skipped: ${skipped.length} (already exist)`,
    ].join("\n");

    try {
      const importConfigStore = new MnemonicConfigStore(VAULT_PATH);
      await vault.git.commit(commitMessage, filesToCommit);
      const mutationPushMode = (await importConfigStore.load()).mutationPushMode;
      if (mutationPushMode !== "none") {
        await vault.git.push();
      }
    } catch (err) {
      console.error(`\nNotes written but git operation failed: ${err}`);
    }

    console.log(`\n✓ Imported ${notesToWrite.length} note${notesToWrite.length === 1 ? "" : "s"} into main vault`);
    process.exit(0);
  }

  await runImportCli().catch(err => {
    console.error("Import failed:", err);
    process.exit(1);
  });
  process.exit(0);
}

// ── Config ────────────────────────────────────────────────────────────────────

const VAULT_PATH = process.env["VAULT_PATH"]
  ? resolveUserPath(process.env["VAULT_PATH"])
  : defaultVaultPath();

const DEFAULT_RECALL_LIMIT = 5;
const DEFAULT_MIN_SIMILARITY = 0.3;
const TEMPORAL_HISTORY_NOTE_LIMIT = 5;
const TEMPORAL_HISTORY_COMMIT_LIMIT = 5;

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
    "Absolute project working directory. Pass this whenever the task is project-related so routing, search boosting, policy, and vault selection work correctly."
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

/**
 * Checks if the git branch has changed since the last operation for a directory.
 * If a branch change is detected, automatically triggers sync to rebuild embeddings.
 * Returns true if sync was triggered, false otherwise.
 */
async function ensureBranchSynced(cwd?: string): Promise<boolean> {
  if (!cwd) return false;

  const previousBranch = await checkBranchChange(cwd);
  if (!previousBranch) return false; // No branch change or not in git repo

  console.error(`[branch] Detected branch change from '${previousBranch}' — auto-syncing`);
  
  // Trigger sync to rebuild embeddings
  const mainResult = await vaultManager.main.git.sync();
  console.error(`[branch] Main vault sync: ${JSON.stringify(mainResult)}`);

  const projectVault = await vaultManager.getProjectVaultIfExists(cwd);
  if (projectVault) {
    const projectResult = await projectVault.git.sync();
    console.error(`[branch] Project vault sync: ${JSON.stringify(projectResult)}`);
    
    // Backfill embeddings after sync
    const backfill = await backfillEmbeddingsAfterSync(projectVault.storage, "project vault", [], true);
    console.error(`[branch] Project vault embedded ${backfill.embedded} notes`);
  }

  const mainBackfill = await backfillEmbeddingsAfterSync(vaultManager.main.storage, "main vault", [], true);
  console.error(`[branch] Main vault embedded ${mainBackfill.embedded} notes`);

  // Vault contents changed — discard session cache so next access rebuilds from fresh state
  invalidateActiveProjectCache();

  return true;
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

function describeLifecycle(lifecycle: NoteLifecycle): string {
  return `lifecycle: ${lifecycle}`;
}

function formatNote(note: Note, score?: number, showRawRelated = true): string {
  const scoreStr = score !== undefined ? ` | similarity: ${score.toFixed(3)}` : "";
  const projectStr = note.project ? ` | project: ${note.projectName ?? note.project}` : " | global";
  const relStr = showRawRelated && note.relatedTo && note.relatedTo.length > 0
    ? `\n**related:** ${note.relatedTo.map((r) => `\`${r.id}\` (${r.type})`).join(", ")}`
    : "";
  return (
    `## ${note.title}\n` +
    `**id:** \`${note.id}\`${projectStr}${scoreStr}\n` +
    `**tags:** ${note.tags.join(", ") || "none"} | **${describeLifecycle(note.lifecycle)}** | **updated:** ${note.updatedAt}${relStr}\n\n` +
    note.content
  );
}

function formatTemporalHistory(
  history: Array<{
    commitHash: string;
    timestamp: string;
    message: string;
    summary?: string;
  }>
): string {
  if (history.length === 0) {
    return "**history:** no git history found";
  }

  const lines = ["**history:**"];
  for (const entry of history) {
    const summary = entry.summary ? ` — ${entry.summary}` : "";
    lines.push(`- \`${entry.commitHash.slice(0, 7)}\` ${entry.timestamp} — ${entry.message}${summary}`);
  }
  return lines.join("\n");
}

function formatRelationshipPreview(preview: RelationshipPreview): string {
  const shown = preview.shown
    .map(r => `${r.title} (\`${r.id}\`) [${r.relationType ?? "related-to"}]`)
    .join(", ");
  const more = preview.truncated
    ? ` [+${preview.totalDirectRelations - preview.shown.length} more]`
    : "";
  return `**related (${preview.totalDirectRelations}):** ${shown}${more}`;
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

function formatAskForWriteScope(
  project: Awaited<ReturnType<typeof resolveProject>>,
  unadopted: boolean = false,
): string {
  const projectLabel = project ? `${project.name} (${project.id})` : "this context";
  const header = unadopted
    ? `No memory policy set for ${projectLabel} and this project hasn't adopted mnemonic yet.`
    : `Project memory policy for ${projectLabel} is set to always ask.`;
  return [
    header,
    "Choose where to store this memory and call `remember` again with one of:",
    "- `scope: \"project\"` — create `.mnemonic/` in this repo and store there (adopts mnemonic)",
    "- `scope: \"global\"` — private main vault with project association",
    "",
    "To avoid being asked again: call `set_project_memory_policy` with your preferred scope.",
  ].join("\n");
}

function formatAskForProtectedBranch(
  projectLabel: string,
  branch: string,
  patterns: string[],
  toolName: string,
): string {
  return [
    `Protected branch check for ${projectLabel}: current branch \`${branch}\` matches ${patterns.join(", ")}.`,
    "Choose how to proceed:",
    `- One-time override: call \`${toolName}\` again with \`allowProtectedBranch: true\``,
    "- Persist policy: call `set_project_memory_policy` with `protectedBranchBehavior: \"block\"`",
    "- Persist policy: call `set_project_memory_policy` with `protectedBranchBehavior: \"allow\"`",
    "",
    "Optional: set `protectedBranchPatterns` to customize which branches are protected.",
  ].join("\n");
}

function formatProtectedBranchBlocked(
  projectLabel: string,
  branch: string,
  patterns: string[],
  toolName: string,
): string {
  return [
    `Auto-commit blocked for ${projectLabel}: current branch \`${branch}\` matches protected patterns ${patterns.join(", ")}.`,
    "Policy is set to `protectedBranchBehavior: \"block\"`.",
    `To proceed once, call \`${toolName}\` again with \`allowProtectedBranch: true\`.`,
    "To change the default, call `set_project_memory_policy` with `protectedBranchBehavior: \"allow\"`.",
  ].join("\n");
}

async function shouldBlockProtectedBranchCommit(options: {
  cwd?: string;
  writeScope: WriteScope;
  automaticCommit: boolean;
  projectLabel: string;
  policy: ProjectMemoryPolicy | undefined;
  allowProtectedBranch: boolean;
  toolName: string;
}): Promise<{ blocked: boolean; message?: string }> {
  const { cwd, writeScope, automaticCommit, projectLabel, policy, allowProtectedBranch, toolName } = options;
  if (!cwd || writeScope !== "project" || !automaticCommit) {
    return { blocked: false };
  }

  const branch = await getCurrentGitBranch(cwd);
  if (!branch) {
    return { blocked: false };
  }

  const patterns = resolveProtectedBranchPatterns(policy);
  if (!isProtectedBranch(branch, patterns) || allowProtectedBranch) {
    return { blocked: false };
  }

  const behavior = resolveProtectedBranchBehavior(policy);
  if (behavior === "allow") {
    return { blocked: false };
  }

  const message = behavior === "block"
    ? formatProtectedBranchBlocked(projectLabel, branch, patterns, toolName)
    : formatAskForProtectedBranch(projectLabel, branch, patterns, toolName);
  return { blocked: true, message };
}

async function wouldRelationshipCleanupTouchProjectVault(noteIds: string[]): Promise<boolean> {
  const noteIdSet = new Set(noteIds);
  for (const vault of vaultManager.allKnownVaults()) {
    if (!vault.isProject) {
      continue;
    }

    const notes = await vault.storage.listNotes();
    for (const note of notes) {
      if ((note.relatedTo ?? []).some((rel) => noteIdSet.has(rel.id))) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Get the text to use for embedding a note.
 * Uses the projection's projectionText when available and fresh;
 * falls back to the raw title+content if projection fails.
 */
async function embedTextForNote(storage: Storage, note: Note): Promise<string> {
  try {
    const projection = await getOrBuildProjection(storage, note);
    return projection.projectionText;
  } catch {
    return `${note.title}\n\n${note.content}`;
  }
}

async function embedMissingNotes(
  storage: Storage,
  noteIds?: string[],
  force = false
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

      if (!force) {
        const existing = await storage.readEmbedding(note.id);
        if (existing?.model === embedModel && existing.updatedAt >= note.updatedAt) {
          continue;
        }
      }

      try {
        const text = await embedTextForNote(storage, note);
        const vector = await embed(text);
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

async function backfillEmbeddingsAfterSync(
  storage: Storage,
  label: string,
  lines: string[],
  force = false,
): Promise<{ embedded: number; failed: string[] }> {
  const { rebuilt, failed } = await embedMissingNotes(storage, undefined, force);
  if (rebuilt > 0 || failed.length > 0) {
    lines.push(
      `${label}: embedded ${rebuilt} note(s)${force ? " (force rebuild)." : " (including any missing local embeddings)."}` +
      `${failed.length > 0 ? ` Failed: ${failed.join(", ")}` : ""}`,
    );
  }

  return { embedded: rebuilt, failed };
}

async function removeStaleEmbeddings(storage: Storage, noteIds: string[]): Promise<void> {
  for (const id of noteIds) {
    try { await fs.unlink(storage.embeddingPath(id)); } catch { /* already gone */ }
  }
}

function formatSyncResult(result: SyncResult, label: string, vaultPath?: string): string[] {
  if (!result.hasRemote) return [`${label}: no remote configured — git sync skipped.`];
  const lines: string[] = [];

  if (result.gitError) {
    const { phase, message, isConflict, conflictFiles } = result.gitError;
    if (isConflict) {
      lines.push(`${label}: ✗ merge conflict during ${phase}.`);
      if (conflictFiles && conflictFiles.length > 0) {
        lines.push(`${label}: conflicted files: ${conflictFiles.join(", ")}`);
      }
      const where = vaultPath ?? label;
      lines.push(`${label}: resolve conflicts in ${where}, then run sync again.`);
    } else {
      lines.push(`${label}: ✗ git ${phase} failed: ${message}`);
    }
    // Still report any partial pull results that came through before the failure
    if (result.pulledNoteIds.length > 0)
      lines.push(`${label}: ↓ ${result.pulledNoteIds.length} note(s) pulled before failure.`);
    return lines;
  }

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

function resolveDurability(commit: CommitResult, push: PushResult): PersistenceStatus["durability"] {
  if (push.status === "pushed") {
    return "pushed";
  }

  if (commit.status === "committed") {
    return "committed";
  }

  return "local-only";
}

function buildPersistenceStatus(args: {
  storage: Storage;
  id: string;
  embedding: { status: "written" | "skipped"; reason?: string };
  commit: CommitResult;
  push: PushResult;
  commitMessage?: string;
  commitBody?: string;
  retry?: MutationRetryContract;
}): PersistenceStatus {
  return {
    notePath: args.storage.notePath(args.id),
    embeddingPath: args.storage.embeddingPath(args.id),
    embedding: {
      status: args.embedding.status,
      model: embedModel,
      reason: args.embedding.reason,
    },
    git: {
      commit: args.commit.status,
      push: args.push.status,
      commitOperation: args.commit.operation,
      commitMessage: args.commitMessage,
      commitBody: args.commitBody,
      commitReason: args.commit.reason,
      commitError: args.commit.error,
      pushReason: args.push.reason,
      pushError: args.push.error,
    },
    retry: args.retry,
    durability: resolveDurability(args.commit, args.push),
  };
}

function buildMutationRetryContract(args: {
  commit: CommitResult;
  commitMessage: string;
  commitBody?: string;
  files: string[];
  cwd?: string;
  vault: Vault;
  mutationApplied: boolean;
  preferredRecovery?: "manual-exact-git-recovery" | "rerun-tool-call-serial" | "no-manual-recovery";
}): MutationRetryContract | undefined {
  if (args.commit.status !== "failed") {
    return undefined;
  }

  const recoveryKind = args.preferredRecovery ?? (args.mutationApplied
    ? "manual-exact-git-recovery"
    : "no-manual-recovery");

  const recoveryReason = recoveryKind === "rerun-tool-call-serial"
    ? "Tool-level reconciliation exists for this mutation; rerun the same tool call serially for the affected vault."
    : recoveryKind === "manual-exact-git-recovery"
      ? "Mutation is already persisted on disk; manual git recovery is allowed only with the exact attemptedCommit values."
      : "Mutation was not applied deterministically; manual git recovery is not authorized.";

  return {
    recovery: {
      kind: recoveryKind,
      allowed: recoveryKind !== "no-manual-recovery",
      reason: recoveryReason,
    },
    attemptedCommit: {
      subject: args.commitMessage,
      body: args.commitBody,
      files: args.files,
      cwd: args.cwd,
      vault: storageLabel(args.vault),
      error: args.commit.error ?? "Unknown git commit failure",
      operation: args.commit.operation,
    },
    mutationApplied: args.mutationApplied,
    retrySafe: args.mutationApplied,
    rationale: args.mutationApplied
      ? "Mutation is already persisted on disk; commit can be retried deterministically."
      : "Mutation was not applied; retry may require re-running the operation.",
    instructions: {
      sourceOfTruth: recoveryKind === "manual-exact-git-recovery" ? "attemptedCommit" : "tool-response",
      useExactSubject: recoveryKind === "manual-exact-git-recovery",
      useExactBody: recoveryKind === "manual-exact-git-recovery",
      useExactFiles: recoveryKind === "manual-exact-git-recovery",
      forbidInferenceFromHistory: true,
      forbidInferenceFromTitleOrSummary: true,
      forbidParallelSameVaultRetries: true,
      preferToolReconciliation: recoveryKind === "rerun-tool-call-serial",
      rerunSameToolCallSerially: recoveryKind === "rerun-tool-call-serial",
    },
  };
}

function formatRetrySummary(retry?: MutationRetryContract): string | undefined {
  if (!retry) {
    return undefined;
  }

  const opLabel = retry.attemptedCommit.operation === "add" ? "add" : "commit";
  const error = retry.attemptedCommit.error;
  const lines: string[] = [];

  switch (retry.recovery.kind) {
    case "rerun-tool-call-serial":
      lines.push("Recovery: rerun same tool call serially");
      lines.push(retry.recovery.reason);
      lines.push("Rerun the same mnemonic tool call one time for the affected vault.");
      lines.push("Do not replay same-vault mutations in parallel.");
      lines.push("Manual git recovery is not authorized for this failure.");
      lines.push("Git failure:");
      lines.push(`${opLabel}: ${error}`);
      break;
    case "manual-exact-git-recovery":
      lines.push("Recovery: manual exact git recovery allowed");
      lines.push(retry.recovery.reason);
      lines.push("Use only the exact values below. Do not infer from git history, note title, summary, or repo state.");
      lines.push("");
      lines.push("Commit subject:");
      lines.push(retry.attemptedCommit.subject);
      if (retry.attemptedCommit.body) {
        lines.push("");
        lines.push("Commit body:");
        lines.push(retry.attemptedCommit.body);
      }
      lines.push("");
      lines.push("Files:");
      for (const file of retry.attemptedCommit.files) {
        lines.push(`- ${file}`);
      }
      lines.push("");
      lines.push("Git failure:");
      lines.push(`${opLabel}: ${error}`);
      break;
    case "no-manual-recovery":
      lines.push("Recovery: no manual recovery authorized");
      lines.push(retry.recovery.reason);
      lines.push("Git failure:");
      lines.push(`${opLabel}: ${error}`);
      break;
    default: {
      const _exhaustive: never = retry.recovery.kind;
      throw new Error(`Unknown recovery kind: ${_exhaustive}`);
    }
  }

  return lines.join("\n");
}

function formatPersistenceSummary(persistence: PersistenceStatus): string {
  const parts = [
    `Persistence: embedding ${persistence.embedding.status}`,
    `git ${persistence.durability}`,
  ];

  const lines = [parts.join(" | ")];

  if (persistence.embedding.reason) {
    lines[0] += ` | embedding reason=${persistence.embedding.reason}`;
  }

  const retrySummary = formatRetrySummary(persistence.retry);

  if (!retrySummary && persistence.git.commit === "failed" && persistence.git.commitError) {
    const opLabel = persistence.git.commitOperation === "add" ? "add" : "commit";
    lines.push(`Git ${opLabel} error: ${persistence.git.commitError}`);
  }

  if (persistence.git.push === "failed" && persistence.git.pushError) {
    lines.push(`Git push error: ${persistence.git.pushError}`);
  }

  if (retrySummary) {
    lines.push(retrySummary);
  }

  return lines.join("\n");
}

async function getMutationPushMode(): Promise<MutationPushMode> {
  const latestConfig = await configStore.load();
  return latestConfig.mutationPushMode;
}

async function pushAfterMutation(vault: Vault): Promise<PushResult> {
  const mutationPushMode = await getMutationPushMode();

  switch (mutationPushMode) {
    case "all":
      return vault.git.pushWithStatus();
    case "main-only":
      return vault.isProject
        ? { status: "skipped", reason: "auto-push-disabled" }
        : vault.git.pushWithStatus();
    case "none":
      return { status: "skipped", reason: "auto-push-disabled" };
    default: {
      const _exhaustive: never = mutationPushMode;
      throw new Error(`Unknown mutation push mode: ${_exhaustive}`);
    }
  }
}

type SearchScope = "project" | "global" | "all";
type StorageScope = "project-vault" | "main-vault" | "any";

type NoteEntry = {
  note: Note;
  vault: Vault;
};

function storageLabel(vault: Vault): string {
  if (!vault.isProject) return "main-vault";
  // Primary project vault uses the conventional label for backward compatibility.
  if (vault.vaultFolderName === ".mnemonic") return "project-vault";
  // Submodule vaults use a "sub-vault:<folder>" label so the type and folder are both clear.
  return `sub-vault:${vault.vaultFolderName}`;
}

/**
 * Check whether a vault matches a storage scope filter.
 * "project-vault" matches all project vaults including submodule vaults.
 */
function vaultMatchesStorageScope(vault: Vault, storedIn: StorageScope): boolean {
  if (storedIn === "any") return true;
  if (storedIn === "main-vault") return !vault.isProject;
  // "project-vault" covers the primary project vault and all submodule vaults.
  return vault.isProject;
}

async function collectVisibleNotes(
  cwd?: string,
  scope: SearchScope = "all",
  tags?: string[],
  storedIn: StorageScope = "any",
  sessionProjectId?: string,
): Promise<{ project: Awaited<ReturnType<typeof resolveProject>>; entries: NoteEntry[] }> {
  const project = await resolveProject(cwd);
  const vaults = await vaultManager.searchOrder(cwd);

  let filterProject: string | null | undefined = undefined;
  if (scope === "project" && project) filterProject = project.id;
  else if (scope === "global") filterProject = null;

  const seen = new Set<string>();
  const entries: NoteEntry[] = [];

  for (const vault of vaults) {
    let rawNotes: Note[];
    if (sessionProjectId) {
      const cached = await getOrBuildVaultNoteList(sessionProjectId, vault);
      if (cached !== undefined) {
        // Apply project filter on the full cached list
        rawNotes = filterProject !== undefined
          ? cached.filter((n) => filterProject === null ? !n.project : n.project === filterProject)
          : cached;
      } else {
        rawNotes = await vault.storage.listNotes(
          filterProject !== undefined ? { project: filterProject } : undefined
        );
      }
    } else {
      rawNotes = await vault.storage.listNotes(
        filterProject !== undefined ? { project: filterProject } : undefined
      );
    }
    for (const note of rawNotes) {
      if (seen.has(note.id)) {
        continue;
      }
      if (tags && tags.length > 0) {
        const noteTags = new Set(note.tags);
        if (!tags.every((tag) => noteTags.has(tag))) {
          continue;
        }
      }
      if (storedIn !== "any" && !vaultMatchesStorageScope(vault, storedIn)) {
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
  cwd?: string,
): Promise<{ note: Note; persistence: PersistenceStatus }> {
  const { note, vault: sourceVault } = found;
  const finalNote = noteToWrite ?? note;
  const embedding = await sourceVault.storage.readEmbedding(note.id);

  await targetVault.storage.writeNote(finalNote);
  if (embedding) {
    await targetVault.storage.writeEmbedding(embedding);
  }

  await sourceVault.storage.deleteNote(note.id);

  const sourceVaultLabel = storageLabel(sourceVault);
  const targetVaultLabel = storageLabel(targetVault);

  const targetCommitBody = formatCommitBody({
    summary: `Moved from ${sourceVaultLabel} to ${targetVaultLabel}`,
    noteId: finalNote.id,
    noteTitle: finalNote.title,
    projectName: finalNote.projectName,
  });
  const targetCommitMessage = `move: ${finalNote.title}`;
  const targetCommitFiles = [vaultManager.noteRelPath(targetVault, finalNote.id)];
  const targetCommit = await targetVault.git.commitWithStatus(targetCommitMessage, targetCommitFiles, targetCommitBody);

  const sourceCommitBody = formatCommitBody({
    summary: `Moved to ${targetVaultLabel}`,
    noteId: finalNote.id,
    noteTitle: finalNote.title,
    projectName: finalNote.projectName,
  });
  await sourceVault.git.commitWithStatus(`move: ${finalNote.title}`, [vaultManager.noteRelPath(sourceVault, finalNote.id)], sourceCommitBody);
  const targetPush = targetCommit.status === "committed"
    ? await pushAfterMutation(targetVault)
    : { status: "skipped" as const, reason: "commit-failed" as const };
  const retry = buildMutationRetryContract({
    commit: targetCommit,
    commitMessage: targetCommitMessage,
    commitBody: targetCommitBody,
    files: targetCommitFiles,
    cwd,
    vault: targetVault,
    mutationApplied: true,
  });
  if (sourceVault !== targetVault) {
    await pushAfterMutation(sourceVault);
  }

  return {
    note: finalNote,
    persistence: buildPersistenceStatus({
      storage: targetVault.storage,
      id: finalNote.id,
      embedding: embedding ? { status: "written" } : { status: "skipped", reason: "no-source-embedding" },
      commit: targetCommit,
      push: targetPush,
      commitMessage: targetCommitMessage,
      commitBody: targetCommitBody,
      retry,
    }),
  };
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
      "Detect the effective project identity for a working directory.\n\n" +
      "Use this when:\n" +
      "- You have a repo path and need the project id/name before storing or searching memories\n" +
      "- You want project-aware routing and search boosting\n\n" +
      "Do not use this when:\n" +
      "- You need to inspect identity override details; use `get_project_identity` instead\n\n" +
      "Returns:\n" +
      "- Effective project id, name, source, and any active policy hint\n\n" +
      "Read-only.\n\n" +
      "Typical next step:\n" +
      "- Use `recall` or `project_memory_summary` to orient on existing memory.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    outputSchema: ProjectIdentityResultSchema,
    inputSchema: z.object({
      cwd: z.string().describe("Absolute project working directory. Pass this whenever the task is project-related so routing, search boosting, policy, and vault selection work correctly."),
    }),
  },
  async ({ cwd }) => {
    const identity = await resolveProjectIdentityForCwd(cwd);
    const project = identity?.project;
    if (!project || !identity) {
      return { content: [{ type: "text", text: `Could not detect a project for: ${cwd}` }], isError: true };
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
      "Show the effective project identity for a working directory, including any configured remote override.\n\n" +
      "Use this when:\n" +
      "- You need to verify whether project identity comes from `origin`, `upstream`, or an override\n" +
      "- You are debugging project scoping issues\n\n" +
      "Do not use this when:\n" +
      "- You only need the project id/name to continue; use `detect_project` instead\n\n" +
      "Returns:\n" +
      "- Effective project identity, default identity, and any configured override\n\n" +
      "Read-only.\n\n" +
      "Typical next step:\n" +
      "- Use `set_project_identity` only if the wrong remote is defining identity.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: z.object({
      cwd: z.string().describe("Absolute project working directory. Pass this whenever the task is project-related so routing, search boosting, policy, and vault selection work correctly."),
    }),
    outputSchema: ProjectIdentityResultSchema,
  },
  async ({ cwd }) => {
    const identity = await resolveProjectIdentityForCwd(cwd);
    if (!identity) {
      return { content: [{ type: "text", text: `Could not detect a project for: ${cwd}` }], isError: true };
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
      "Override which git remote defines project identity for a repo.\n\n" +
      "Use this when:\n" +
      "- A fork should associate memory with the upstream project rather than the fork remote\n" +
      "- Project detection is resolving to the wrong canonical repo\n\n" +
      "Do not use this when:\n" +
      "- The default remote already identifies the correct project\n\n" +
      "Returns:\n" +
      "- The new effective project identity after applying the override\n\n" +
      "Side effects: writes config, git commits, and may push.\n\n" +
      "Typical next step:\n" +
      "- Re-run `detect_project` or `get_project_identity` to verify the result.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: z.object({
      cwd: z.string().describe("Absolute project working directory. Pass this whenever the task is project-related so routing, search boosting, policy, and vault selection work correctly."),
      remoteName: z.string().min(1).describe("Git remote name to use as the canonical project identity, such as `upstream`")
    }),
    outputSchema: ProjectIdentityResultSchema,
  },
  async ({ cwd, remoteName }) => {
    const defaultIdentity = await resolveProjectIdentity(cwd);
    if (!defaultIdentity) {
      return { content: [{ type: "text", text: `Could not detect a project for: ${cwd}` }], isError: true };
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
    const commitMessage = `identity: ${defaultProject.name} use remote ${remoteName}`;
    const commitFiles = ["config.json"];
    const commitStatus = await vaultManager.main.git.commitWithStatus(commitMessage, commitFiles, commitBody);
    const pushStatus = commitStatus.status === "committed"
      ? await pushAfterMutation(vaultManager.main)
      : { status: "skipped" as const, reason: "commit-failed" as const };
    const retry = buildMutationRetryContract({
      commit: commitStatus,
      commitMessage,
      commitBody,
      files: commitFiles,
      cwd,
      vault: vaultManager.main,
      mutationApplied: true,
    });

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
      retry,
    };

    return {
      content: [{
        type: "text",
        text:
          `Project identity override set for ${defaultProject.name}: ` +
          `default=\`${defaultProject.id}\`, effective=\`${candidateIdentity.project.id}\`, remote=${remoteName}` +
          `${commitStatus.status === "failed"
            ? `\n${formatRetrySummary(retry) ?? `Commit failed. Push status: ${pushStatus.status}.`}`
            : ""
          }`,
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
    description:
      "List available schema migrations and show which ones are pending for each vault.\n\n" +
      "Use this when:\n" +
      "- Checking whether a mnemonic upgrade requires vault changes\n" +
      "- Preparing to run `execute_migration`\n\n" +
      "Do not use this when:\n" +
      "- You already know the exact migration to run and only need to execute it\n\n" +
      "Returns:\n" +
      "- Available migrations, vault schema versions, and pending counts\n\n" +
      "Read-only.\n\n" +
      "Typical next step:\n" +
      "- Run `execute_migration` with `dryRun: true` first.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: z.object({}),
    outputSchema: MigrationListResultSchema,
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
    description:
      "Execute a named schema migration on vault notes.\n\n" +
      "Use this when:\n" +
      "- `list_migrations` shows pending migrations that should be applied\n\n" +
      "Do not use this when:\n" +
      "- You have not checked pending migrations yet\n" +
      "- You have not previewed the migration with `dryRun: true`\n\n" +
      "Returns:\n" +
      "- Per-vault migration results, counts, warnings, and errors\n\n" +
      "Side effects: modifies note files, git commits per affected vault, and may push.\n\n" +
      "Typical next step:\n" +
      "- Re-run `list_migrations` to confirm nothing is pending.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: z.object({
      migrationName: z.string().describe("Name of the migration to execute (get names from `list_migrations`)"),
      dryRun: z.boolean().default(true).describe("If true, show what would change without actually modifying notes. Always try dry-run first."),
      backup: z.boolean().default(true).describe("If true, warn about backing up before real migration"),
      cwd: projectParam.optional().describe("Optional: limit migration to a specific project vault"),
    }),
    outputSchema: MigrationExecuteResultSchema,
  },
  async ({ migrationName, dryRun, backup, cwd }) => {
    await ensureBranchSynced(cwd);

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
      "REQUIRES: Call `recall` or `list` first to check whether this memory already exists.\n\n" +
      "Create a new memory as a markdown note with embeddings for future recall.\n\n" +
      "Use this when:\n" +
      "- A decision, preference, bug fix, or durable context should survive beyond this session\n" +
      "- No existing note already covers the topic\n\n" +
      "Do not use this when:\n" +
      "- A memory may already exist; use `recall` first to check\n" +
      "- You need to change an existing memory; use `update`\n" +
      "- Several overlapping notes should be merged; use `consolidate`\n\n" +
      "Returns:\n" +
      "- The created memory id, scope, vault label, lifecycle, and persistence status\n\n" +
      "Side effects: writes a note, writes embeddings, git commits, and may push.\n\n" +
      "Typical next step:\n" +
      "- Use `relate` if this new memory connects to something recalled earlier.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    inputSchema: z.object({
      title: z.string().describe("Specific, retrieval-friendly title. Prefer the concrete topic or decision, not a vague label."),
      content: z.string().describe(
        "Markdown note body. Put the key fact, decision, or outcome in the opening lines, then supporting detail. Embeddings weight early content more heavily."
      ),
      tags: z.array(z.string()).optional().default([]).describe("Optional tags for later filtering. Use a small number of stable, meaningful tags."),
      lifecycle: z
        .enum(NOTE_LIFECYCLES)
        .optional()
        .describe(
          "Memory lifetime. Use `temporary` for short-lived working context such as active investigations or transient status. " +
          "Use `permanent` for durable knowledge such as decisions, fixes, patterns, and preferences."
        ),
      summary: z.string().optional().describe(
        "Git commit summary only. Imperative mood, concise, and focused on why the change matters."
      ),
      cwd: z
        .string()
        .optional()
        .describe(
          "Absolute project working directory. Pass this whenever the task is related to a repository so routing, search boosting, policy lookup, and vault selection work correctly."
        ),
      scope: z
        .enum(WRITE_SCOPES)
        .optional()
        .describe(
          "Where to store: 'project' writes to the shared project vault visible to all contributors; " +
          "'global' writes to the private main vault visible only on this machine. " +
          "When omitted, uses the project's saved policy or defaults to 'project'."
        ),
      allowProtectedBranch: z
        .boolean()
        .optional()
        .describe(
          "One-time override for protected branch checks. " +
          "When true, remember can commit on a protected branch without changing project policy."
        ),
      checkedForExisting: z
        .boolean()
        .optional()
        .describe(
          "Optional agent hint indicating that `recall` or `list` was already used to check for an existing memory on this topic."
        ),
    }),
    outputSchema: RememberResultSchema,
  },
  async ({ title, content, tags, lifecycle, summary, cwd, scope, allowProtectedBranch = false }) => {
    await ensureBranchSynced(cwd);

    const project = await resolveProject(cwd);
    const cleanedContent = await cleanMarkdown(content);
    const policy = project ? await configStore.getProjectPolicy(project.id) : undefined;
    const policyScope = policy?.defaultScope;
    const projectVaultExists = cwd ? Boolean(await vaultManager.getProjectVaultIfExists(cwd)) : true;
    const writeScope = resolveWriteScope(scope, policyScope, Boolean(project), projectVaultExists);
    if (writeScope === "ask") {
      const unadopted = !projectVaultExists && !policyScope;
      return { content: [{ type: "text", text: formatAskForWriteScope(project, unadopted) }], isError: true };
    }

    const protectedBranchCheck = await shouldBlockProtectedBranchCommit({
      cwd,
      writeScope,
      automaticCommit: true,
      projectLabel: project ? `${project.name} (${project.id})` : "this context",
      policy,
      allowProtectedBranch,
      toolName: "remember",
    });
    if (protectedBranchCheck.blocked) {
      return { content: [{ type: "text", text: protectedBranchCheck.message ?? "Protected branch policy blocked this commit." }], isError: true };
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

    let embeddingStatus: { status: "written" | "skipped"; reason?: string } = { status: "written" };

    try {
      const text = await embedTextForNote(vault.storage, note);
      const vector = await embed(text);
      await vault.storage.writeEmbedding({ id, model: embedModel, embedding: vector, updatedAt: now });
    } catch (err) {
      embeddingStatus = { status: "skipped", reason: err instanceof Error ? err.message : String(err) };
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
    const commitMessage = `remember: ${title}`;
    const commitFiles = [vaultManager.noteRelPath(vault, id)];
    const commitStatus = await vault.git.commitWithStatus(commitMessage, commitFiles, commitBody);
    const pushStatus = commitStatus.status === "committed"
      ? await pushAfterMutation(vault)
      : { status: "skipped" as const, reason: "commit-failed" as const };
    const retry = buildMutationRetryContract({
      commit: commitStatus,
      commitMessage,
      commitBody,
      files: commitFiles,
      cwd,
      vault,
      mutationApplied: true,
    });
    const persistence = buildPersistenceStatus({
      storage: vault.storage,
      id,
      embedding: embeddingStatus,
      commit: commitStatus,
      push: pushStatus,
      commitMessage,
      commitBody,
      retry,
    });

    const vaultLabel = vault.isProject ? " [project vault]" : " [main vault]";
    const textContent = `Remembered as \`${id}\` [${projectScope}, stored=${writeScope}]${vaultLabel}\n${formatPersistenceSummary(persistence)}`;
    
    const structuredContent: RememberResult = {
      action: "remembered",
      id,
      title,
      project: project ? { id: project.id, name: project.name } : undefined,
      scope: writeScope,
      vault: storageLabel(vault),
      tags: tags || [],
      lifecycle: note.lifecycle,
      timestamp: now,
      persistence,
    };

    invalidateActiveProjectCache();
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
      "Set the default write scope and memory behavior for a project.\n\n" +
      "Use this when:\n" +
      "- A project should default to project or global storage\n" +
      "- Protected-branch handling or consolidation behavior should be standardized\n\n" +
      "Do not use this when:\n" +
      "- You only need a one-off write location for a single `remember` call\n\n" +
      "Returns:\n" +
      "- The saved project policy and effective values\n\n" +
      "Side effects: writes config, git commits, and may push.\n\n" +
      "Typical next step:\n" +
      "- Use `get_project_memory_policy` to verify the saved policy.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: z.object({
      cwd: z.string().describe("Absolute project working directory. Pass this whenever the task is project-related so routing, search boosting, policy, and vault selection work correctly."),
      defaultScope: z.enum(PROJECT_POLICY_SCOPES).optional().describe(
        "Default storage: 'project' = shared project vault, 'global' = private main vault, 'ask' = prompt each time"
      ),
      consolidationMode: z.enum(CONSOLIDATION_MODES).optional().describe(
        "Default consolidation mode: 'supersedes' preserves history (default), 'delete' removes sources immediately"
      ),
      protectedBranchBehavior: z.enum(PROTECTED_BRANCH_BEHAVIORS).optional().describe(
        "Behavior for protected-branch matches during project-vault commits by mutating tools: 'ask', 'block', or 'allow'"
      ),
      protectedBranchPatterns: z.array(z.string()).optional().describe(
        "Protected branch glob patterns. Defaults to [\"main\", \"master\", \"release*\"] when not set"
      ),
    }),
    outputSchema: PolicyResultSchema,
  },
  async ({ cwd, defaultScope, consolidationMode, protectedBranchBehavior, protectedBranchPatterns }) => {
    const project = await resolveProject(cwd);
    if (!project) {
      return { content: [{ type: "text", text: `Could not detect a project for: ${cwd}` }], isError: true };
    }

    if (
      defaultScope === undefined
      && consolidationMode === undefined
      && protectedBranchBehavior === undefined
      && protectedBranchPatterns === undefined
    ) {
      return {
        content: [{
          type: "text",
          text: "No policy fields provided. Set at least one of: defaultScope, consolidationMode, protectedBranchBehavior, protectedBranchPatterns.",
        }],
        isError: true,
      };
    }

    const existing = await configStore.getProjectPolicy(project.id);
    const effectiveDefaultScope = defaultScope ?? existing?.defaultScope ?? "project";
    const effectiveConsolidationMode = consolidationMode ?? existing?.consolidationMode;
    const effectiveProtectedBranchBehavior = protectedBranchBehavior ?? existing?.protectedBranchBehavior;
    const effectiveProtectedBranchPatterns = protectedBranchPatterns
      ? protectedBranchPatterns.map((pattern) => pattern.trim()).filter((pattern) => pattern.length > 0)
      : existing?.protectedBranchPatterns;

    const now = new Date().toISOString();
    const policy: ProjectMemoryPolicy = {
      projectId: project.id,
      projectName: project.name,
      defaultScope: effectiveDefaultScope,
      consolidationMode: effectiveConsolidationMode,
      protectedBranchBehavior: effectiveProtectedBranchBehavior,
      protectedBranchPatterns: effectiveProtectedBranchPatterns,
      updatedAt: now,
    };
    await configStore.setProjectPolicy(policy);

    const modeStr = effectiveConsolidationMode ? `, consolidationMode=${effectiveConsolidationMode}` : "";
    const branchBehaviorStr = effectiveProtectedBranchBehavior
      ? `, protectedBranchBehavior=${effectiveProtectedBranchBehavior}`
      : "";
    const branchPatternsStr = effectiveProtectedBranchPatterns && effectiveProtectedBranchPatterns.length > 0
      ? `, protectedBranchPatterns=${effectiveProtectedBranchPatterns.join("|")}`
      : "";
    const commitBody = formatCommitBody({
      projectName: project.name,
      description:
        `Default scope: ${effectiveDefaultScope}` +
        `${effectiveConsolidationMode ? `\nConsolidation mode: ${effectiveConsolidationMode}` : ""}` +
        `${effectiveProtectedBranchBehavior ? `\nProtected branch behavior: ${effectiveProtectedBranchBehavior}` : ""}` +
        `${effectiveProtectedBranchPatterns && effectiveProtectedBranchPatterns.length > 0
          ? `\nProtected branch patterns: ${effectiveProtectedBranchPatterns.join(", ")}`
          : ""
        }`,
    });
    const commitMessage = `policy: ${project.name} default scope ${effectiveDefaultScope}`;
    const commitFiles = ["config.json"];
    const commitStatus = await vaultManager.main.git.commitWithStatus(commitMessage, commitFiles, commitBody);
    const pushStatus = commitStatus.status === "committed"
      ? await pushAfterMutation(vaultManager.main)
      : { status: "skipped" as const, reason: "commit-failed" as const };
    const retry = buildMutationRetryContract({
      commit: commitStatus,
      commitMessage,
      commitBody,
      files: commitFiles,
      cwd,
      vault: vaultManager.main,
      mutationApplied: true,
    });

    const structuredContent: PolicyResult = {
      action: "policy_set",
      project: { id: project.id, name: project.name },
      defaultScope: effectiveDefaultScope,
      consolidationMode: effectiveConsolidationMode,
      protectedBranchBehavior: effectiveProtectedBranchBehavior,
      protectedBranchPatterns: effectiveProtectedBranchPatterns,
      updatedAt: now,
      retry,
    };

    return {
      content: [{
        type: "text",
        text:
          `Project memory policy set for ${project.name}: defaultScope=${effectiveDefaultScope}` +
          `${modeStr}${branchBehaviorStr}${branchPatternsStr}` +
          `${commitStatus.status === "failed"
            ? `\n${formatRetrySummary(retry) ?? `Commit failed. Push status: ${pushStatus.status}.`}`
            : ""
          }`,
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
    description:
      "Show the saved memory policy for a project.\n\n" +
      "Use this when:\n" +
      "- You want to confirm the default write scope before storing memory\n" +
      "- You are debugging why notes land in an unexpected vault\n" +
      "- You need to inspect protected-branch or consolidation defaults\n\n" +
      "Do not use this when:\n" +
      "- You want to change the policy; use `set_project_memory_policy`\n\n" +
      "Returns:\n" +
      "- Saved policy values or an explanation of the fallback behavior\n\n" +
      "Read-only.\n\n" +
      "Typical next step:\n" +
      "- Call `remember` with explicit `scope` for a one-off override, or `set_project_memory_policy` to change defaults.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: z.object({
      cwd: z.string().describe("Absolute project working directory. Pass this whenever the task is project-related so routing, search boosting, policy, and vault selection work correctly."),
    }),
    outputSchema: PolicyResultSchema,
  },
  async ({ cwd }) => {
    const project = await resolveProject(cwd);
    if (!project) {
      return { content: [{ type: "text", text: `Could not detect a project for: ${cwd}` }], isError: true };
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
      protectedBranchBehavior: policy.protectedBranchBehavior,
      protectedBranchPatterns: policy.protectedBranchPatterns,
      updatedAt: policy.updatedAt,
    };

    const details = [
      `defaultScope=${policy.defaultScope}`,
      policy.consolidationMode ? `consolidationMode=${policy.consolidationMode}` : undefined,
      policy.protectedBranchBehavior ? `protectedBranchBehavior=${policy.protectedBranchBehavior}` : undefined,
      policy.protectedBranchPatterns && policy.protectedBranchPatterns.length > 0
        ? `protectedBranchPatterns=${policy.protectedBranchPatterns.join("|")}`
        : undefined,
    ].filter(Boolean).join(", ");

    return {
      content: [{
        type: "text",
        text: `Project memory policy for ${project.name}: ${details} (updated ${policy.updatedAt})`,
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
      "Semantic search over stored memories using embeddings.\n\n" +
      "Supports opt-in temporal mode (`mode: \"temporal\"`) to enrich top semantic matches with compact git-backed history.\n\n" +
      "Use this when:\n" +
      "- You know the topic but not the exact memory id\n" +
      "- You are starting a session and want relevant prior context\n" +
      "- You want to check whether a memory already exists before creating another one\n" +
      "- You explicitly want to inspect how a note evolved over time\n\n" +
      "Do not use this when:\n" +
      "- You already know the exact id; use `get`\n" +
      "- You just want to browse by tags or scope; use `list`\n\n" +
      "Returns:\n" +
      "- Ranked memory matches with scores, vault label, tags, lifecycle, and updated time\n" +
      "- Bounded 1-hop relationship previews automatically attached to top results\n" +
      "- In temporal mode, optional compact history entries for top matches\n\n" +
      "Read-only.\n\n" +
      "Typical next step:\n" +
      "- Use `get`, `update`, `relate`, or `consolidate` based on the results.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: z.object({
      query: z.string().describe("Natural-language search query describing the topic, decision, bug, preference, or context you want to find."),
      cwd: projectParam,
      limit: z.number().int().min(1).max(20).optional().default(DEFAULT_RECALL_LIMIT),
      minSimilarity: z.number().min(0).max(1).optional().default(DEFAULT_MIN_SIMILARITY),
      mode: z.enum(["default", "temporal"]).optional().default("default").describe("Temporal history is opt-in. Use `temporal` to enrich top semantic matches with compact git-backed history."),
      verbose: z.boolean().optional().default(false).describe("Only meaningful with `mode: \"temporal\"`. Adds richer stats-based history context without returning raw diffs."),
      tags: z.array(z.string()).optional().describe("Filter results to notes with all of these tags."),
      scope: z
        .enum(["project", "global", "all"])
        .optional()
        .default("all")
        .describe(
          "'project' = only this project's memories (project-scoped storage), " +
          "'global' = only unscoped memories (main/global storage), " +
          "'all' = both, with project notes boosted (default)"
        ),
    }),
    outputSchema: RecallResultSchema,
  },
  async ({ query, cwd, limit, minSimilarity, mode, verbose, tags, scope }) => {
    const t0Recall = performance.now();
    await ensureBranchSynced(cwd);

    const project = await resolveProject(cwd);
    const queryVec = await embed(query);
    const vaults = await vaultManager.searchOrder(cwd);
    const noteCache = new Map<string, Note>();

    const noteCacheKey = (vault: Vault, id: string): string => `${vault.storage.vaultPath}::${id}`;
    const readCachedNote = async (vault: Vault, id: string): Promise<Note | null> => {
      // Check session cache first (populated when getOrBuildVaultEmbeddings was called)
      if (project) {
        const sessionNote = getSessionCachedNote(project.id, vault.storage.vaultPath, id);
        if (sessionNote !== undefined) return sessionNote;
      }
      const key = noteCacheKey(vault, id);
      const cached = noteCache.get(key);
      if (cached) {
        return cached;
      }

      const note = await vault.storage.readNote(id);
      if (note) {
        noteCache.set(key, note);
      }

      return note;
    };

    for (const vault of vaults) {
      await embedMissingNotes(vault.storage).catch(() => { /* best-effort: don't block recall if Ollama is down */ });
    }

    const scored: Array<{ id: string; score: number; boosted: number; vault: Vault; isCurrentProject: boolean }> = [];

    for (const vault of vaults) {
      const embeddings = project
        ? (await getOrBuildVaultEmbeddings(project.id, vault)) ?? await vault.storage.listEmbeddings()
        : await vault.storage.listEmbeddings();

      for (const rec of embeddings) {
        const rawScore = cosineSimilarity(queryVec, rec.embedding);
        if (rawScore < minSimilarity) continue;

        const note = await readCachedNote(vault, rec.id);
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

        const metadataBoost = computeRecallMetadataBoost(getEffectiveMetadata(note));
        const boost = (isCurrentProject ? 0.15 : 0) + metadataBoost;
        scored.push({ id: rec.id, score: rawScore, boosted: rawScore + boost, vault, isCurrentProject: Boolean(isCurrentProject) });
      }
    }

    const top = selectRecallResults(scored, limit, scope);

    if (top.length === 0) {
      const structuredContent: RecallResult = { action: "recalled", query, scope: scope || "all", results: [] };
      return { content: [{ type: "text", text: "No memories found matching that query." }], structuredContent };
    }

    const header = project
      ? `Recall results for project **${project.name}** (scope: ${scope}):`
      : `Recall results (global):`;

    const sections: string[] = [];
    const structuredResults: Array<{
      id: string;
      title: string;
      score: number;
      boosted: number;
      project?: string;
      projectName?: string;
      vault: string;
      tags: string[];
      lifecycle: NoteLifecycle;
      updatedAt: string;
      provenance?: {
        lastUpdatedAt: string;
        lastCommitHash: string;
        lastCommitMessage: string;
        recentlyChanged: boolean;
      };
      confidence?: "high" | "medium" | "low";
      history?: Array<{
        commitHash: string;
        timestamp: string;
        message: string;
        summary?: string;
        stats?: {
          additions: number;
          deletions: number;
          filesChanged: number;
          changeType: "metadata-only change" | "minor edit" | "substantial update";
        };
      }>;
      relationships?: RelationshipPreview;
    }> = [];
    
    // Determine how many top results get relationship expansion
    // Top 1 by default, top 3 if result count is small
    const recallRelationshipLimit = top.length <= 3 ? 3 : 1;
    
    for (const [index, { id, score, vault, boosted }] of top.entries()) {
      const note = await readCachedNote(vault, id);
      if (note) {
        const centrality = note.relatedTo?.length ?? 0;
        const filePath = `${vault.notesRelDir}/${id}.md`;
        const provenance = await getNoteProvenance(vault.git, filePath);
        const confidence = computeConfidence(note.lifecycle, note.updatedAt, centrality);
        let history: Array<{
          commitHash: string;
          timestamp: string;
          message: string;
          summary?: string;
          stats?: {
            additions: number;
            deletions: number;
            filesChanged: number;
            changeType: "metadata-only change" | "minor edit" | "substantial update";
          };
        }> | undefined;

        if (mode === "temporal") {
          if (index < TEMPORAL_HISTORY_NOTE_LIMIT) {
            const commits = await vault.git.getFileHistory(filePath, TEMPORAL_HISTORY_COMMIT_LIMIT);
            history = await Promise.all(
              commits.map(async (commit) => {
                const stats = await vault.git.getCommitStats(filePath, commit.hash);
                return buildTemporalHistoryEntry(commit, stats, verbose);
              })
            );
          }
        }

        // Add relationship preview for top N results (fail-soft)
        let relationships: RelationshipPreview | undefined;
        if (index < recallRelationshipLimit) {
          relationships = await getRelationshipPreview(
            note,
            vaultManager.allKnownVaults(),
            { activeProjectId: project?.id, limit: 3 }
          );
        }

        const formattedHistory = mode === "temporal" && history !== undefined
          ? `\n\n${formatTemporalHistory(history)}`
          : "";
        const formattedRelationships = relationships !== undefined
          ? `\n\n${formatRelationshipPreview(relationships)}`
          : "";
        // Suppress raw related IDs when enriched preview is shown to avoid duplication
        sections.push(`${formatNote(note, score, relationships === undefined)}${formattedHistory}${formattedRelationships}`);

        structuredResults.push({
          id,
          title: note.title,
          score,
          boosted,
          project: note.project,
          projectName: note.projectName,
          vault: storageLabel(vault),
          tags: note.tags,
          lifecycle: note.lifecycle,
          updatedAt: note.updatedAt,
          provenance,
          confidence,
          history,
          relationships,
        });
      }
    }

    const textContent = `${header}\n\n${sections.join("\n\n---\n\n")}`;

    const structuredContent: RecallResult = {
      action: "recalled",
      query,
      scope: scope || "all",
      results: structuredResults,
    };

    console.error(`[recall:timing] ${(performance.now() - t0Recall).toFixed(1)}ms`);
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
    description:
      "Use after `recall` + `get` when an existing memory should be refined instead of creating a duplicate.\n\n" +
      "Modify an existing memory by id.\n\n" +
      "Use this when:\n" +
      "- A stored memory is stale, incomplete, or wrong\n" +
      "- You recalled something useful and want to refine the same note instead of creating a duplicate\n\n" +
      "Do not use this when:\n" +
      "- No note exists yet; use `remember`\n" +
      "- Several notes need to be merged or retired together; use `consolidate`\n\n" +
      "Returns:\n" +
      "- The updated memory id, changed fields, and persistence status\n\n" +
      "Side effects: rewrites the note, refreshes embeddings, git commits, and may push.\n\n" +
      "Typical next step:\n" +
      "- Use `relate` or `consolidate` if the update changes how this note connects to others.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    inputSchema: z.object({
      id: z.string().describe("Exact memory id. Use an id returned by `recall`, `list`, `recent_memories`, or `where_is`."),
      content: z.string().optional().describe("Markdown note body. Put the key fact, decision, or outcome in the opening lines, then supporting detail."),
      title: z.string().optional().describe("Specific, retrieval-friendly title. Prefer the concrete topic or decision, not a vague label."),
      tags: z.array(z.string()).optional().describe("Optional tags for later filtering. Use a small number of stable, meaningful tags."),
      lifecycle: z
        .enum(NOTE_LIFECYCLES)
        .optional()
        .describe("Change lifecycle. Preserve the existing value unless you're intentionally switching it."),
      summary: z.string().optional().describe("Git commit summary only. Imperative mood, concise, and focused on why the change matters."),
      cwd: projectParam,
      allowProtectedBranch: z
        .boolean()
        .optional()
        .describe(
          "One-time override for protected branch checks. " +
          "When true, update can commit on a protected branch without changing project policy."
        ),
    }),
    outputSchema: UpdateResultSchema,
  },
  async ({ id, content, title, tags, lifecycle, summary, cwd, allowProtectedBranch = false }) => {
    await ensureBranchSynced(cwd);

    const found = await vaultManager.findNote(id, cwd);
    if (!found) {
      return { content: [{ type: "text", text: `No memory found with id '${id}'` }], isError: true };
    }

    const { note, vault } = found;
    if (vault.isProject) {
      const resolvedProject = await resolveProject(cwd);
      const projectLabel = resolvedProject
        ? `${resolvedProject.name} (${resolvedProject.id})`
        : `${note.projectName ?? "project"} (${note.project ?? "unknown"})`;
      const policy = note.project ? await configStore.getProjectPolicy(note.project) : undefined;
      const protectedBranchCheck = await shouldBlockProtectedBranchCommit({
        cwd,
        writeScope: "project",
        automaticCommit: true,
        projectLabel,
        policy,
        allowProtectedBranch,
        toolName: "update",
      });
      if (protectedBranchCheck.blocked) {
        return {
          content: [{ type: "text", text: protectedBranchCheck.message ?? "Protected branch policy blocked this commit." }],
          isError: true,
        };
      }
    }

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

    let embeddingStatus: { status: "written" | "skipped"; reason?: string } = { status: "written" };

    try {
      const text = await embedTextForNote(vault.storage, updated);
      const vector = await embed(text);
      await vault.storage.writeEmbedding({ id, model: embedModel, embedding: vector, updatedAt: now });
    } catch (err) {
      embeddingStatus = { status: "skipped", reason: err instanceof Error ? err.message : String(err) };
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
    const commitMessage = `update: ${updated.title}`;
    const commitFiles = [vaultManager.noteRelPath(vault, id)];
    const commitStatus = await vault.git.commitWithStatus(commitMessage, commitFiles, commitBody);
    const pushStatus = commitStatus.status === "committed"
      ? await pushAfterMutation(vault)
      : { status: "skipped" as const, reason: "commit-failed" as const };
    const retry = buildMutationRetryContract({
      commit: commitStatus,
      commitMessage,
      commitBody,
      files: commitFiles,
      cwd,
      vault,
      mutationApplied: true,
    });
    const persistence = buildPersistenceStatus({
      storage: vault.storage,
      id,
      embedding: embeddingStatus,
      commit: commitStatus,
      push: pushStatus,
      commitMessage,
      commitBody,
      retry,
    });

    const structuredContent: UpdateResult = {
      action: "updated",
      id,
      title: updated.title,
      fieldsModified: changes,
      timestamp: now,
      project: updated.project,
      projectName: updated.projectName,
      lifecycle: updated.lifecycle,
      persistence,
    };
    
    invalidateActiveProjectCache();
    return { content: [{ type: "text", text: `Updated memory '${id}'\n${formatPersistenceSummary(persistence)}` }], structuredContent };
  }
);

// ── forget ────────────────────────────────────────────────────────────────────
server.registerTool(
  "forget",
  {
    title: "Forget",
    description:
      "Delete an existing memory by id and clean up dangling relationships.\n\n" +
      "Use this when:\n" +
      "- A memory should be removed entirely\n" +
      "- A note is obsolete and should not remain searchable\n\n" +
      "Do not use this when:\n" +
      "- The note should stay but move to another vault; use `move_memory`\n" +
      "- The note should be replaced or merged; use `consolidate`\n\n" +
      "Returns:\n" +
      "- Deleted memory id/title and relationship cleanup details\n\n" +
      "Side effects: deletes note files, cleans relationship references, git commits, and may push.\n\n" +
      "Typical next step:\n" +
      "- Use `recall` or `list` to confirm the remaining memory set is clean.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: z.object({
      id: z.string().describe("Exact memory id. Use an id returned by `recall`, `list`, `recent_memories`, or `where_is`."),
      cwd: projectParam,
      allowProtectedBranch: z
        .boolean()
        .optional()
        .describe(
          "One-time override for protected branch checks. " +
          "When true, forget can commit on a protected branch without changing project policy."
        ),
    }),
    outputSchema: ForgetResultSchema,
  },
  async ({ id, cwd, allowProtectedBranch = false }) => {
    await ensureBranchSynced(cwd);

    const found = await vaultManager.findNote(id, cwd);
    if (!found) {
      return { content: [{ type: "text", text: `No memory found with id '${id}'` }], isError: true };
    }

    const { note, vault: noteVault } = found;
    const touchesProjectVault = noteVault.isProject || await wouldRelationshipCleanupTouchProjectVault([id]);
    if (touchesProjectVault) {
      const resolvedProject = await resolveProject(cwd);
      const projectLabel = resolvedProject
        ? `${resolvedProject.name} (${resolvedProject.id})`
        : `${note.projectName ?? "project"} (${note.project ?? "unknown"})`;
      const policy = note.project ? await configStore.getProjectPolicy(note.project) : undefined;
      const protectedBranchCheck = await shouldBlockProtectedBranchCommit({
        cwd,
        writeScope: "project",
        automaticCommit: true,
        projectLabel,
        policy,
        allowProtectedBranch,
        toolName: "forget",
      });
      if (protectedBranchCheck.blocked) {
        return {
          content: [{ type: "text", text: protectedBranchCheck.message ?? "Protected branch policy blocked this commit." }],
          isError: true,
        };
      }
    }

    await noteVault.storage.deleteNote(id);

    // Clean up dangling references grouped by vault so we make one commit per vault
    const vaultChanges = await removeRelationshipsToNoteIds([id]);

    // Always include the deleted note's path (git add on a deleted file stages the removal)
    addVaultChange(vaultChanges, noteVault, vaultManager.noteRelPath(noteVault, id));

    let retry: MutationRetryContract | undefined;
    for (const [v, files] of vaultChanges) {
      const isPrimaryVault = v === noteVault;
      const summary = isPrimaryVault ? `Deleted note and cleaned up ${files.length - 1} reference(s)` : "Cleaned up dangling reference";
      const commitBody = formatCommitBody({
        summary,
        noteId: id,
        noteTitle: note.title,
        projectName: note.projectName,
      });
      const commitMessage = `forget: ${note.title}`;
      const commitStatus = await v.git.commitWithStatus(commitMessage, files, commitBody);
      if (!retry) {
        retry = buildMutationRetryContract({
          commit: commitStatus,
          commitMessage,
          commitBody,
          files,
          cwd,
          vault: v,
          mutationApplied: true,
        });
      }
      if (commitStatus.status === "committed") {
        await pushAfterMutation(v);
      }
    }

    const structuredContent: ForgetResult = {
      action: "forgotten",
      id,
      title: note.title,
      project: note.project,
      projectName: note.projectName,
      relationshipsCleaned: vaultChanges.size > 0 ? Array.from(vaultChanges.values()).reduce((sum, files) => sum + files.length - 1, 0) : 0,
      vaultsModified: Array.from(vaultChanges.keys()).map(v => storageLabel(v)),
      retry,
    };
    
    const retrySummary = formatRetrySummary(retry);
    invalidateActiveProjectCache();
    return {
      content: [{
        type: "text",
        text: `Forgotten '${id}' (${note.title})${retrySummary ? `\n${retrySummary}` : ""}`,
      }],
      structuredContent,
    };
  }
);

// ── get ───────────────────────────────────────────────────────────────────────
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
      ids: z.array(z.string()).min(1).describe("One or more memory ids to fetch"),
      cwd: projectParam,
      includeRelationships: z.boolean().optional().default(false).describe("Include bounded direct relationship previews (1-hop expansion, max 3 shown)"),
    }),
    outputSchema: GetResultSchema,
  },
  async ({ ids, cwd, includeRelationships }) => {
    const t0Get = performance.now();
    await ensureBranchSynced(cwd);

    const project = await resolveProject(cwd);
    const found: GetResult["notes"] = [];
    const notFound: string[] = [];

    for (const id of ids) {
      // Check session cache before hitting storage
      let result: { note: Note; vault: Vault } | null = null;
      if (project) {
        for (const vault of vaultManager.allKnownVaults()) {
          const cached = getSessionCachedNote(project.id, vault.storage.vaultPath, id);
          if (cached !== undefined) {
            result = { note: cached, vault };
            break;
          }
        }
      }
      if (!result) {
        result = await vaultManager.findNote(id, cwd);
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
          vaultManager.allKnownVaults(),
          { activeProjectId: project?.id, limit: 3 }
        );
      }
      
      found.push({
        id: note.id,
        title: note.title,
        content: note.content,
        project: note.project,
        projectName: note.projectName,
        tags: note.tags,
        lifecycle: note.lifecycle,
        relatedTo: note.relatedTo,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
        vault: storageLabel(vault),
        relationships,
      });
    }

    const lines: string[] = [];
    for (const note of found) {
      lines.push(`## ${note.title} (${note.id})`);
      lines.push(`project: ${note.projectName ?? note.project ?? "global"} | stored: ${note.vault} | lifecycle: ${note.lifecycle}`);
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

// ── where_is_memory ───────────────────────────────────────────────────────────
server.registerTool(
  "where_is_memory",
  {
    title: "Where Is Memory",
    description:
      "Locate which storage label and project association a memory currently has.\n\n" +
      "Use this when:\n" +
      "- You know the id and want to see where the memory lives\n" +
      "- You are deciding whether a note should be moved between project storage locations\n\n" +
      "Do not use this when:\n" +
      "- You need the full note content; use `get`\n" +
      "- You want to search for a note by topic; use `recall`\n\n" +
      "Returns:\n" +
      "- Title, project association, storage label, updated time, and relationship count\n\n" +
      "Read-only.\n\n" +
      "Typical next step:\n" +
      "- Use `move_memory` if the storage location is wrong, or `get` for full inspection.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: z.object({
      id: z.string().describe("Exact memory id. Use an id returned by `recall`, `list`, `recent_memories`, or `where_is`."),
      cwd: projectParam,
    }),
    outputSchema: WhereIsResultSchema,
  },
  async ({ id, cwd }) => {
    await ensureBranchSynced(cwd);

    const found = await vaultManager.findNote(id, cwd);
    if (!found) {
      return { content: [{ type: "text", text: `No memory found with id '${id}'` }], isError: true };
    }

    const { note, vault } = found;
    const vaultLabel = storageLabel(vault);
    const projectDisplay = note.projectName && note.project
      ? `${note.projectName} (${note.project})`
      : note.projectName ?? note.project ?? "global";
    const relatedCount = note.relatedTo?.length ?? 0;

    const structuredContent: WhereIsResult = {
      action: "located",
      id: note.id,
      title: note.title,
      project: note.project,
      projectName: note.projectName,
      vault: vaultLabel,
      updatedAt: note.updatedAt,
      relatedCount,
    };

    return {
      content: [{
        type: "text",
        text: `'${note.title}' (${id})\nproject: ${projectDisplay} | stored: ${vaultLabel} | updated: ${note.updatedAt} | related: ${relatedCount}`,
      }],
      structuredContent,
    };
  }
);

// ── list ──────────────────────────────────────────────────────────────────────
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
    await ensureBranchSynced(cwd);

    const { project, entries } = await collectVisibleNotes(cwd, scope, tags, storedIn);

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
      project?: string;
      projectName?: string;
      tags: string[];
      lifecycle: NoteLifecycle;
      vault: string;
      updatedAt: string;
      hasRelated?: boolean;
    }> = entries.map(({ note, vault }) => ({
      id: note.id,
      title: note.title,
      project: note.project,
      projectName: note.projectName,
      tags: note.tags,
      lifecycle: note.lifecycle,
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

// ── discover_tags ───────────────────────────────────────────────────────────
type DiscoverTagStat = {
  count: number;
  examples: string[];
  lifecycles: Set<NoteLifecycle>;
  contextMatches: number;
  exactCandidateMatch: boolean;
};

function tokenizeTagDiscoveryText(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function countTokenOverlap(tokens: Set<string>, other: Iterable<string>): number {
  let matches = 0;
  for (const token of other) {
    if (tokens.has(token)) {
      matches++;
    }
  }
  return matches;
}

function hasExactTagContextMatch(tag: string, values: Array<string | undefined>): boolean {
  const normalizedTag = tag.toLowerCase();
  return values.some(value => value?.toLowerCase().includes(normalizedTag) ?? false);
}

server.registerTool(
  "discover_tags",
  {
    title: "Discover Tags",
    description:
      "Suggest canonical tags for a specific note before `remember` when tag choice is ambiguous.\n\n" +
      "Use this when:\n" +
      "- You have a note title, content, or query and want compact tag suggestions\n" +
      "- You want canonical project terminology without exposing lots of unrelated tags\n" +
      "- You want to demote temporary-only tags unless they fit the note\n\n" +
      "Do not use this when:\n" +
      "- You need to browse notes by tag; use `list` with `tags` filter instead\n" +
      "- You already know the exact tags you want to use\n" +
      "- You want broad inventory output but are not explicitly requesting `mode: \"browse\"`\n\n" +
      "Returns:\n" +
      "- Default: bounded `recommendedTags` ranked by note relevance first and usage count second\n" +
      "- Each suggestion includes canonicality and lifecycle signals plus one compact example\n" +
      "- Optional `mode: \"browse\"` returns broader inventory output\n\n" +
      "Typical next step:\n" +
      "- Reuse suggested canonical tags when they fit, or create a new tag only when genuinely novel.\n\n" +
      "Performance: O(n) where n = total notes scanned. Expect 100-200ms for 500 notes.\n\n" +
      "Read-only.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: z.object({
      cwd: projectParam,
      mode: z.enum(["suggest", "browse"]).optional().default("suggest"),
      title: z.string().optional(),
      content: z.string().optional(),
      query: z.string().optional(),
      candidateTags: z.array(z.string()).optional(),
      lifecycle: z.enum(NOTE_LIFECYCLES).optional(),
      scope: z
        .enum(["project", "global", "all"])
        .optional()
        .default("all")
        .describe(
          "'project' = only this project's memories; " +
          "'global' = only unscoped memories; " +
          "'all' = everything visible (default)"
        ),
      storedIn: z
        .enum(["project-vault", "main-vault", "any"])
        .optional()
        .default("any")
        .describe("Filter by vault storage label like list tool."),
      limit: z.number().int().min(1).max(50).optional(),
    }),
    outputSchema: DiscoverTagsResultSchema,
  },
  async ({ cwd, mode, title, content, query, candidateTags, lifecycle, scope, storedIn, limit }) => {
    await ensureBranchSynced(cwd);
    const startTime = Date.now();

    const { project, entries } = await collectVisibleNotes(cwd, scope, undefined, storedIn);

    const tagStats = new Map<string, DiscoverTagStat>();
    const candidateTagSet = new Set((candidateTags || []).map(tag => tag.toLowerCase()));
    const contextValues = [title, content, query, ...(candidateTags || [])];
    const contextTokens = new Set(tokenizeTagDiscoveryText(contextValues.filter(Boolean).join(" ")));
    const isTemporaryTarget = lifecycle === "temporary";
    const effectiveLimit = limit ?? (mode === "browse" ? 20 : 10);

    for (const { note } of entries) {
      const noteTokens = new Set(tokenizeTagDiscoveryText(`${note.title} ${note.content} ${note.tags.join(" ")}`));
      const contextMatches = contextTokens.size > 0 ? countTokenOverlap(contextTokens, noteTokens) : 0;

      for (const tag of note.tags) {
        const stats = tagStats.get(tag) || {
          count: 0,
          examples: [],
          lifecycles: new Set<NoteLifecycle>(),
          contextMatches: 0,
          exactCandidateMatch: false,
        };
        stats.count++;
        if (stats.examples.length < 3) {
          stats.examples.push(note.title);
        }
        stats.lifecycles.add(note.lifecycle);
        stats.contextMatches += contextMatches;
        if (candidateTagSet.has(tag.toLowerCase())) {
          stats.exactCandidateMatch = true;
        }
        tagStats.set(tag, stats);
      }
    }

    const rawTags = Array.from(tagStats.entries())
      .map(([tag, stats]) => {
        const lifecycleTypes = Array.from(stats.lifecycles) as NoteLifecycle[];
        const isTemporaryOnly = stats.lifecycles.size === 1 && stats.lifecycles.has("temporary");
        const tagTokens = tokenizeTagDiscoveryText(tag);
        const exactContextMatch = stats.exactCandidateMatch || hasExactTagContextMatch(tag, contextValues);
        const tagTokenOverlap = contextTokens.size > 0
          ? countTokenOverlap(contextTokens, tagTokens)
          : 0;
        const averageContextMatch = stats.count > 0 ? stats.contextMatches / stats.count : 0;
        const reason = exactContextMatch
          ? "matches a candidate tag already present in the note context"
          : tagTokenOverlap > 0 || stats.contextMatches > 0
            ? "matches the note context and existing project usage"
            : "high-usage canonical tag from existing project notes";

        return {
          tag,
          usageCount: stats.count,
          examples: stats.examples,
          example: stats.examples[0],
          reason,
          lifecycleTypes,
          isTemporaryOnly,
          exactContextMatch,
          tagTokenOverlap,
          averageContextMatch,
          isBroadSingleToken: tagTokens.length === 1,
          isHighFrequency: stats.count >= 4,
          specificityBoost: tagTokens.length > 1 ? 4 : 0,
        };
      });

    const hasStrongSpecificCandidate = rawTags.some(tag =>
      tag.exactContextMatch && (!tag.isBroadSingleToken || tag.usageCount > 1)
    );

    const tags = rawTags
      .map((tag) => {
        const hasWeakDirectMatch = tag.tagTokenOverlap <= 1 && tag.averageContextMatch <= 2;
        const genericPenalty = hasStrongSpecificCandidate && tag.isBroadSingleToken && tag.isHighFrequency && hasWeakDirectMatch
          ? 10
          : 0;
        const score = hasStrongSpecificCandidate
          ? (tag.exactContextMatch ? 12 : 0) +
            (tag.tagTokenOverlap * 5) +
            tag.specificityBoost +
            (tag.averageContextMatch * 3) +
            (tag.usageCount * 0.1) -
            genericPenalty -
            (!isTemporaryTarget && tag.isTemporaryOnly ? 2 : 0)
          : (tag.usageCount * 1.5) +
            (tag.isTemporaryOnly ? -3 : 1) -
            (!isTemporaryTarget && tag.isTemporaryOnly ? 2 : 0);

        return {
          ...tag,
          score,
        };
      })
      .sort((a, b) => b.score - a.score || b.usageCount - a.usageCount || a.tag.localeCompare(b.tag));

    const durationMs = Date.now() - startTime;
    const vaultsSearched = new Set(entries.map(e => storageLabel(e.vault))).size;

    const lines: string[] = [];
    if (mode === "browse") {
      if (project && scope !== "global") {
        lines.push(`Tags for ${project.name} (scope: ${scope}):`);
      } else {
        lines.push(`Tags (scope: ${scope}):`);
      }
      lines.push("");
      lines.push(`Total: ${tags.length} unique tags across ${entries.length} notes (${durationMs}ms)`);
      lines.push("");
      lines.push("Tags sorted by usage:");
      for (const t of tags.slice(0, effectiveLimit)) {
        const lifecycleMark = t.isTemporaryOnly ? " [temp-only]" : "";
        lines.push(`  ${t.tag} (${t.usageCount})${lifecycleMark}`);
        if (t.examples.length > 0) {
          lines.push(`    Example: "${t.examples[0]}"`);
        }
      }
      if (tags.length > effectiveLimit) {
        lines.push(`  ... and ${tags.length - effectiveLimit} more`);
      }
    } else {
      const suggestedTags = tags.slice(0, effectiveLimit);
      if (project && scope !== "global") {
        lines.push(`Suggested tags for ${project.name} (scope: ${scope}):`);
      } else {
        lines.push(`Suggested tags (scope: ${scope}):`);
      }
      lines.push("");
      lines.push(`Considered ${tags.length} unique tags across ${entries.length} notes (${durationMs}ms)`);
      lines.push("");
      if (contextTokens.size === 0) {
        lines.push("No note context provided; showing the most canonical existing tags.");
        lines.push("");
      }
      lines.push("Recommended tags:");
      for (const t of suggestedTags) {
        const lifecycleMark = t.isTemporaryOnly ? " [temp-only]" : "";
        lines.push(`  ${t.tag} (${t.usageCount})${lifecycleMark}`);
        if (t.example) {
          lines.push(`    Example: "${t.example}"`);
        }
        lines.push(`    Why: ${t.reason}`);
      }
    }

    const structuredContent: DiscoverTagsResult = mode === "browse"
      ? {
          action: "tags_discovered",
          project: project ? { id: project.id, name: project.name } : undefined,
          mode,
          scope: scope || "all",
          tags: tags.slice(0, effectiveLimit).map(({ score, example, reason, ...tag }) => tag),
          totalTags: tags.length,
          totalNotes: entries.length,
          vaultsSearched,
          durationMs,
        }
      : {
          action: "tags_discovered",
          project: project ? { id: project.id, name: project.name } : undefined,
          mode,
          scope: scope || "all",
          recommendedTags: tags.slice(0, effectiveLimit).map(({ score, examples, ...tag }) => tag),
          totalTags: tags.length,
          totalNotes: entries.length,
          vaultsSearched,
          durationMs,
        };

    return { content: [{ type: "text", text: lines.join("\n") }], structuredContent };
  }
);

// ── recent_memories ───────────────────────────────────────────────────────────
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
    }),
    outputSchema: RecentResultSchema,
  },
  async ({ cwd, scope, storedIn, limit, includePreview, includeStorage }) => {
    await ensureBranchSynced(cwd);

    const { project, entries } = await collectVisibleNotes(cwd, scope, undefined, storedIn);
    const recent = [...entries]
      .sort((a, b) => b.note.updatedAt.localeCompare(a.note.updatedAt))
      .slice(0, limit);

    if (recent.length === 0) {
      const structuredContent: RecentResult = { action: "recent_shown", project: project?.id, projectName: project?.name, count: 0, limit: limit || 5, notes: [] };
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
        project: note.project,
        projectName: note.projectName,
        tags: note.tags,
        lifecycle: note.lifecycle,
        vault: storageLabel(vault),
        updatedAt: note.updatedAt,
        preview: includePreview && note.content ? note.content.substring(0, 100) + (note.content.length > 100 ? "..." : "") : undefined,
    }));
    
    const structuredContent: RecentResult = {
      action: "recent_shown",
      project: project?.id,
      projectName: project?.name,
      count: recent.length,
      limit: limit || 5,
      notes: structuredNotes,
    };
    
    return { content: [{ type: "text", text: textContent }], structuredContent };
  }
);

// ── memory_graph ──────────────────────────────────────────────────────────────
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
    await ensureBranchSynced(cwd);

    const { project, entries } = await collectVisibleNotes(cwd, scope, undefined, storedIn);
    if (entries.length === 0) {
      const structuredContent: MemoryGraphResult = { action: "graph_shown", project: project?.id, projectName: project?.name, nodes: [], limit, truncated: false };
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
      const structuredContent: MemoryGraphResult = { action: "graph_shown", project: project?.id, projectName: project?.name, nodes: [], limit, truncated: false };
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
    description:
      "Generate a high-level summary of what is already known for a project.\n\n" +
      "Use this when:\n" +
      "- You want fast orientation before starting work\n" +
      "- You need a synthesized overview instead of raw note listings\n\n" +
      "Do not use this when:\n" +
      "- You need exact note contents; use `get`\n" +
      "- You need direct semantic matches for a query; use `recall`\n\n" +
      "Returns:\n" +
      "- A synthesized project-level summary based on stored memories\n" +
      "- Bounded 1-hop relationship previews on orientation entry points (primaryEntry and suggestedNext)\n\n" +
      "Read-only.\n\n" +
      "Typical next step:\n" +
      "- Use `recall` or `list` to drill down into specific areas.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: z.object({
      cwd: z.string().describe("Absolute project working directory. Pass this whenever the task is project-related so routing, search boosting, policy, and vault selection work correctly."),
      maxPerTheme: z.number().int().min(1).max(5).optional().default(3),
      recentLimit: z.number().int().min(1).max(10).optional().default(5),
      anchorLimit: z.number().int().min(1).max(10).optional().default(5),
      includeRelatedGlobal: z.boolean().optional().default(false),
      relatedGlobalLimit: z.number().int().min(1).max(5).optional().default(3),
    }),
    outputSchema: ProjectSummaryResultSchema,
  },
  async ({ cwd, maxPerTheme, recentLimit, anchorLimit, includeRelatedGlobal, relatedGlobalLimit }) => {
    const t0Summary = performance.now();
    await ensureBranchSynced(cwd);

    // Pre-resolve project so we can pass its id to collectVisibleNotes for session caching
    const preProject = await resolveProject(cwd);
    const { project, entries } = await collectVisibleNotes(cwd, "all", undefined, "any", preProject?.id);
    if (!project) {
      return { content: [{ type: "text", text: `Could not detect a project for: ${cwd}` }], isError: true };
    }

    // Separate project-scoped notes (for themes/anchors) from global notes
    const projectEntries = entries.filter(e =>
      e.note.project === project.id || e.vault.isProject
    );

    // Empty-project case: no project-scoped notes exist
    if (projectEntries.length === 0) {
      const structuredContent: ProjectSummaryResult = {
        action: "project_summary_shown",
        project: { id: project.id, name: project.name },
        notes: { total: 0, projectVault: 0, mainVault: 0, privateProject: 0 },
        themes: {},
        recent: [],
        anchors: [],
        orientation: {
          primaryEntry: { id: "", title: "No notes", rationale: "Empty project vault" },
          suggestedNext: [],
        },
      };
      return { content: [{ type: "text", text: `No memories found for project ${project.name}.` }], structuredContent };
    }

    const policyLine = await formatProjectPolicyLine(project.id);

    const projectNoteIds = new Set(projectEntries.map(e => e.note.id));

    // Compute promoted themes from keywords (graduation system)
    const graduationResult = computeThemesWithGraduation(projectEntries.map(e => e.note));
    const promotedThemes = new Set(graduationResult.promotedThemes);
    const themeCache = graduationResult.themeAssignments;

    const inboundReferences = new Map<string, number>();
    const linkedByPermanentNotes = new Map<string, number>();
    for (const entry of projectEntries) {
      for (const rel of entry.note.relatedTo ?? []) {
        if (!projectNoteIds.has(rel.id)) {
          continue;
        }

        inboundReferences.set(rel.id, (inboundReferences.get(rel.id) ?? 0) + 1);
        if (entry.note.lifecycle === "permanent") {
          linkedByPermanentNotes.set(rel.id, (linkedByPermanentNotes.get(rel.id) ?? 0) + 1);
        }
      }
    }

    const effectiveMetadataById = new Map(
      projectEntries.map((entry) => {
        const inbound = inboundReferences.get(entry.note.id) ?? 0;
        const visibleOutbound = (entry.note.relatedTo ?? []).filter((rel) => projectNoteIds.has(rel.id)).length;
        const metadata = getEffectiveMetadata(entry.note, {
          inboundReferences: inbound,
          linkedByPermanentNotes: linkedByPermanentNotes.get(entry.note.id) ?? 0,
          anchorCandidate: entry.note.lifecycle === "permanent" && (visibleOutbound > 0 || inbound > 0),
        });
        return [entry.note.id, {
          metadata,
          inbound,
          visibleOutbound,
        }] as const;
      })
    );

    // Categorize by theme with graduation (project-scoped only)
    const themed = new Map<string, NoteEntry[]>();
    for (const entry of projectEntries) {
      const theme = classifyThemeWithGraduation(entry.note, promotedThemes);
      const bucket = themed.get(theme) ?? [];
      bucket.push(entry);
      themed.set(theme, bucket);
    }

    // Theme order: fixed themes first, then promoted themes alphabetically, then "other"
    const fixedThemes = ["overview", "decisions", "tooling", "bugs", "architecture", "quality"];
    const dynamicThemes = graduationResult.promotedThemes.filter(t => !fixedThemes.includes(t));
    const themeOrder = [...fixedThemes, ...dynamicThemes.sort(), "other"];

    // Calculate notes distribution (project-scoped only)
    const projectVaultCount = projectEntries.filter(e => e.vault.isProject).length;
    const mainVaultProjectEntries = projectEntries.filter(e => !e.vault.isProject);
    const mainVaultCount = mainVaultProjectEntries.length;
    const totalProjectNotes = projectEntries.length;

    // Build output sections
    const sections: string[] = [];
    sections.push(`Project summary: **${project.name}**`);
    sections.push(`- id: \`${project.id}\``);
    sections.push(`- ${policyLine.replace(/^Policy:\s*/, "policy: ")}`);
    sections.push(`- memories: ${totalProjectNotes} (project-vault: ${projectVaultCount}, main-vault: ${mainVaultCount})`);
    if (mainVaultProjectEntries.length > 0) {
      sections.push(`- private project memories: ${mainVaultProjectEntries.length}`);
    }

    const themes: Record<string, ThemeSection> = {};
    for (const theme of themeOrder) {
      const bucket = themed.get(theme);
      if (!bucket || bucket.length === 0) continue;
      
      // Sort by within-theme score
      const sorted = [...bucket].sort((a, b) => 
        withinThemeScore(b.note, effectiveMetadataById.get(b.note.id)?.metadata) - withinThemeScore(a.note, effectiveMetadataById.get(a.note.id)?.metadata)
      );
      const top = sorted.slice(0, maxPerTheme);
      
      sections.push(`\n${titleCaseTheme(theme)}:`);
      sections.push(...top.map(e => `- ${e.note.title} (\`${e.note.id}\`)`));
      
      themes[theme] = {
        count: bucket.length,
        examples: top.map(e => ({
          id: e.note.id,
          title: e.note.title,
          updatedAt: e.note.updatedAt,
        })),
      };
    }

    // Recent notes (project-scoped only)
    const recent = [...projectEntries]
      .sort((a, b) => b.note.updatedAt.localeCompare(a.note.updatedAt))
      .slice(0, recentLimit);
    
    sections.push(`\nRecent activity (start here):`);
    sections.push(...recent.map(e => `- ${e.note.updatedAt} — ${e.note.title}`));

    // Anchor notes with diversity constraint (project-scoped only)
    const scoredAnchorCandidates = projectEntries
      .map(e => {
        const baselineContext = effectiveMetadataById.get(e.note.id);
        const metadata = baselineContext?.metadata;
        return {
          entry: e,
          metadata,
          score: anchorScore(e.note, themeCache, metadata),
          theme: themeCache.get(e.note.id) ?? "other",
          alwaysLoad: metadata?.alwaysLoad === true,
          explicitOrientationRole:
            metadata?.roleSource === "explicit" &&
            (metadata.role === "summary" || metadata.role === "decision"),
          hasVisibleGraphParticipation: (baselineContext?.visibleOutbound ?? 0) > 0 || (baselineContext?.inbound ?? 0) > 0,
        };
      })
      .filter(candidate => candidate.score > -Infinity)
      .filter(candidate => candidate.alwaysLoad || candidate.explicitOrientationRole || candidate.hasVisibleGraphParticipation)
      .sort((a, b) => b.score - a.score || a.entry.note.title.localeCompare(b.entry.note.title));

    // Enforce max 2 per theme for scored anchors
    const anchorThemeCounts = new Map<string, number>();
    const anchors: AnchorNote[] = [];
    const anchorIds = new Set<string>();

    // Add scored anchors with theme diversity constraint
    for (const candidate of scoredAnchorCandidates) {
      if (anchors.length >= 10) break;

      const theme = candidate.theme;
      const themeCount = anchorThemeCounts.get(theme) ?? 0;
      if (themeCount >= 2) continue;

      anchors.push({
        id: candidate.entry.note.id,
        title: candidate.entry.note.title,
        centrality: candidate.entry.note.relatedTo?.length ?? 0,
        connectionDiversity: computeConnectionDiversity(candidate.entry.note, themeCache),
        updatedAt: candidate.entry.note.updatedAt,
      });
      anchorIds.add(candidate.entry.note.id);
      anchorThemeCounts.set(theme, themeCount + 1);
    }

    if (anchors.length > 0) {
      sections.push(`\nAnchors:`);
      sections.push(...anchors.slice(0, 5).map(a => 
        `- ${a.title} (\`${a.id}\`) — centrality: ${a.centrality}, diversity: ${a.connectionDiversity}`
      ));
    }

    // Compute orientation after anchors are computed (for text output)
    let relatedGlobal: ProjectSummaryResult["relatedGlobal"];
    
    if (includeRelatedGlobal) {
      const anchorEmbeddings = await Promise.all(
        anchors.slice(0, 5).map(async a => {
          for (const vault of vaultManager.allKnownVaults()) {
            const emb = await vault.storage.readEmbedding(a.id);
            if (emb) return { id: a.id, embedding: emb.embedding };
          }
          return null;
        })
      );
      
      const validAnchors = anchorEmbeddings.filter((e): e is NonNullable<typeof e> => e !== null);
      
      if (validAnchors.length > 0) {
        // Get global notes (not project-scoped)
        const globalEntries = entries.filter(e => !e.note.project);
        const globalCandidates: Array<{ id: string; title: string; similarity: number; preview: string }> = [];
        
        for (const entry of globalEntries) {
          const emb = await entry.vault.storage.readEmbedding(entry.note.id);
          if (!emb) continue;
          
          // Find max similarity to any anchor
          let maxSim = 0;
          for (const anchor of validAnchors) {
            const sim = cosineSimilarity(anchor.embedding, emb.embedding);
            if (sim > maxSim) maxSim = sim;
          }
          
          if (maxSim > 0.4) {
            const projection = await entry.vault.storage.readProjection(entry.note.id);
            const preview = projection?.summary
              ? projection.summary.slice(0, 100)
              : summarizePreview(entry.note.content, 100);
            globalCandidates.push({
              id: entry.note.id,
              title: entry.note.title,
              similarity: maxSim,
              preview,
            });
          }
        }
        
        globalCandidates.sort((a, b) => b.similarity - a.similarity);
        
        if (globalCandidates.length > 0) {
          relatedGlobal = {
            notes: globalCandidates.slice(0, relatedGlobalLimit),
            computedAt: new Date().toISOString(),
          };
          
          sections.push(`\nRelated Global:`);
          sections.push(...relatedGlobal.notes.map(n => 
            `- ${n.title} (\`${n.id}\`) — similarity: ${n.similarity.toFixed(2)}`
          ));
        }
      }
    }

    // Compute orientation layer for actionable guidance
    const primaryAnchor = anchors[0];

    // Build noteId -> vault lookup for provenance enrichment
    const noteVaultMap = new Map<string, Vault>();
    for (const entry of projectEntries) {
      noteVaultMap.set(entry.note.id, entry.vault);
    }

    // Helper to enrich an anchor with provenance and confidence
    const enrichOrientationNote = async (anchor: AnchorNote) => {
      const vault = noteVaultMap.get(anchor.id);
      if (!vault) return {};
      const filePath = `${vault.notesRelDir}/${anchor.id}.md`;
      const provenance = await getNoteProvenance(vault.git, filePath);
      const confidence = computeConfidence("permanent", anchor.updatedAt, anchor.centrality);
      return { provenance, confidence };
    };

    // Helper to enrich an anchor with relationships (1-hop expansion)
    const enrichOrientationNoteWithRelationships = async (anchor: AnchorNote) => {
      const vault = noteVaultMap.get(anchor.id);
      if (!vault) return {};
      const note = await vault.storage.readNote(anchor.id);
      if (!note) return {};
      const relationships = await getRelationshipPreview(
        note,
        vaultManager.allKnownVaults(),
        { activeProjectId: project.id, limit: 3 }
      );
      return { relationships };
    };

    const primaryEnriched = primaryAnchor ? await enrichOrientationNote(primaryAnchor) : {};
    const primaryRelationships = primaryAnchor ? await enrichOrientationNoteWithRelationships(primaryAnchor) : {};
    const suggestedEnriched = await Promise.all(anchors.slice(1, 4).map(enrichOrientationNote));
    const suggestedRelationships = await Promise.all(anchors.slice(1, 4).map(enrichOrientationNoteWithRelationships));

    // Enrich fallback primaryEntry when no anchors exist
    let fallbackEnriched: { provenance?: { lastUpdatedAt: string; lastCommitHash: string; lastCommitMessage: string; recentlyChanged: boolean }; confidence?: "high" | "medium" | "low" } = {};
    let fallbackRelationships: { relationships?: RelationshipPreview } = {};
    if (!primaryAnchor && recent[0]) {
      const fallbackNote = recent[0].note;
      const vault = noteVaultMap.get(fallbackNote.id);
      if (vault) {
        const filePath = `${vault.notesRelDir}/${fallbackNote.id}.md`;
        const provenance = await getNoteProvenance(vault.git, filePath);
        const confidence = computeConfidence(fallbackNote.lifecycle, fallbackNote.updatedAt, 0);
        fallbackEnriched = { provenance, confidence };
      }
      const preview = await getRelationshipPreview(
        fallbackNote,
        vaultManager.allKnownVaults(),
        { activeProjectId: project.id, limit: 3 }
      );
      if (preview) fallbackRelationships = { relationships: preview };
    }

    const orientation: ProjectSummaryResult["orientation"] = {
      primaryEntry: primaryAnchor
        ? {
            id: primaryAnchor.id,
            title: primaryAnchor.title,
            rationale: `Centrality ${primaryAnchor.centrality}, connects ${primaryAnchor.connectionDiversity} themes`,
            ...primaryEnriched,
            ...primaryRelationships,
          }
        : {
            id: recent[0]?.note.id ?? projectEntries[0]?.note.id ?? "",
            title: recent[0]?.note.title ?? projectEntries[0]?.note.title ?? "No notes",
            rationale: recent[0]
              ? "Most recent note — no high-centrality anchors found"
              : "Only note available",
            ...fallbackEnriched,
            ...fallbackRelationships,
          },
      suggestedNext: anchors.slice(1, 4).map((a, i) => ({
        id: a.id,
        title: a.title,
        rationale: `Centrality ${a.centrality}, connects ${a.connectionDiversity} themes`,
        ...suggestedEnriched[i],
        ...suggestedRelationships[i],
      })),
    };

    // Warning for taxonomy dilution
    const otherBucket = themed.get("other");
    const otherCount = otherBucket?.length ?? 0;
    const otherRatio = projectEntries.length > 0 ? otherCount / projectEntries.length : 0;
    if (otherRatio > 0.3) {
      orientation.warnings = [
        `${Math.round(otherRatio * 100)}% of notes in "other" bucket — consider improving thematic classification`,
      ];
    }

    // Orientation text output
    sections.push(`\nOrientation:`);
    sections.push(`Start with: ${orientation.primaryEntry.title} (\`${orientation.primaryEntry.id}\`)`);
    sections.push(`  Rationale: ${orientation.primaryEntry.rationale}`);
    if (orientation.primaryEntry.confidence) {
      sections.push(`  Confidence: ${orientation.primaryEntry.confidence}`);
    }
    if (orientation.primaryEntry.relationships) {
      sections.push(`  ${formatRelationshipPreview(orientation.primaryEntry.relationships)}`);
    }
    if (orientation.suggestedNext.length > 0) {
      sections.push(`Then check:`);
      for (const next of orientation.suggestedNext) {
        sections.push(`  - ${next.title} (\`${next.id}\`) — ${next.rationale}${next.confidence ? ` [${next.confidence}]` : ""}`);
        if (next.relationships) {
          sections.push(`    ${formatRelationshipPreview(next.relationships)}`);
        }
      }
    }
    if (orientation.warnings && orientation.warnings.length > 0) {
      sections.push(`Warnings:`);
      for (const w of orientation.warnings) {
        sections.push(`  - ${w}`);
      }
    }

    // Related global notes (optional, anchor-based similarity)

    const structuredContent: ProjectSummaryResult = {
      action: "project_summary_shown",
      project: { id: project.id, name: project.name },
      notes: {
        total: totalProjectNotes,
        projectVault: projectVaultCount,
        mainVault: mainVaultCount,
        privateProject: mainVaultProjectEntries.length,
      },
      themes,
      recent: recent.map(e => ({
        id: e.note.id,
        title: e.note.title,
        updatedAt: e.note.updatedAt,
        theme: classifyThemeWithGraduation(e.note, promotedThemes),
      })),
      anchors,
      orientation,
      relatedGlobal,
    };

    console.error(`[summary:timing] ${(performance.now() - t0Summary).toFixed(1)}ms`);
    return { content: [{ type: "text", text: sections.join("\n") }], structuredContent };
  }
);

// ── sync ──────────────────────────────────────────────────────────────────────
server.registerTool(
  "sync",
  {
    title: "Sync",
    description:
      "Sync mnemonic vaults with their git remotes and repair local embedding coverage as needed.\n\n" +
      "Use this when:\n" +
      "- You want the local vault state aligned with remote changes\n" +
      "- You suspect another machine or collaborator updated the vaults\n\n" +
      "Do not use this when:\n" +
      "- You only need to inspect or edit a single memory\n\n" +
      "Returns:\n" +
      "- Per-vault pull/push results, deletions, additions, and embedding rebuild info\n\n" +
      "Side effects: performs git sync and may rebuild local embeddings.\n\n" +
      "Typical next step:\n" +
      "- Use `recent_memories`, `list`, or `recall` to inspect newly synced changes.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: z.object({
      cwd: projectParam,
      force: z.boolean().optional().default(false).describe("Rebuild all embeddings even if the current model already generated them"),
    }),
    outputSchema: SyncResultSchema,
  },
  async ({ cwd, force }) => {
    const lines: string[] = [];
    const vaultResults: Array<StructuredSyncResult["vaults"][number]> = [];

    // Always sync main vault
    const mainVaultPath = vaultManager.main.storage.vaultPath;
    const mainResult = await vaultManager.main.git.sync();
    lines.push(...formatSyncResult(mainResult, "main vault", mainVaultPath));
    let mainEmbedded = 0;
    let mainFailed: string[] = [];
    const mainBackfill = await backfillEmbeddingsAfterSync(vaultManager.main.storage, "main vault", lines, force);
    mainEmbedded = mainBackfill.embedded;
    mainFailed = mainBackfill.failed;
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
      gitError: mainResult.gitError,
    });

    // Optionally sync project vault
    if (cwd) {
      const projectVault = await vaultManager.getProjectVaultIfExists(cwd);
      if (projectVault) {
        const projectVaultPath = projectVault.storage.vaultPath;
        const projectResult = await projectVault.git.sync();
        lines.push(...formatSyncResult(projectResult, "project vault", projectVaultPath));
        let projEmbedded = 0;
        let projFailed: string[] = [];
        const projectBackfill = await backfillEmbeddingsAfterSync(projectVault.storage, "project vault", lines, force);
        projEmbedded = projectBackfill.embedded;
        projFailed = projectBackfill.failed;
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
          gitError: projectResult.gitError,
        });
      } else {
        lines.push("project vault: no .mnemonic/ found — skipped.");
      }
    }

    const structuredContent: StructuredSyncResult = {
      action: "synced",
      vaults: vaultResults,
    };

    // Vault contents may have changed via pull — discard session cache
    invalidateActiveProjectCache();
    return { content: [{ type: "text", text: lines.join("\n") }], structuredContent };
  }
);

// ── move_memory ───────────────────────────────────────────────────────────────
server.registerTool(
  "move_memory",
  {
    title: "Move Memory",
    description:
      "Use after `where_is_memory` or `get` confirms a memory is stored in the wrong place.\n\n" +
      "Move a memory between main storage and project storage, optionally targeting a specific sub-vault folder.\n\n" +
      "Use this when:\n" +
      "- A note is stored in the wrong place\n" +
      "- Project-specific knowledge should move between shared project storage and main storage\n" +
      "- A note should live in a specific sub-vault such as `.mnemonic-lib`\n\n" +
      "Do not use this when:\n" +
      "- You only need to edit the note content; use `update`\n" +
      "- You want to delete the note; use `forget`\n\n" +
      "Returns:\n" +
      "- The moved memory id, resulting storage label, project association, and persistence status\n\n" +
      "Side effects: rewrites storage location, may adjust project association, git commits, and may push.\n\n" +
      "Typical next step:\n" +
      "- Use `where_is_memory` or `get` to verify the final state.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: z.object({
      id: z.string().describe("Exact memory id. Use an id returned by `recall`, `list`, `recent_memories`, or `where_is`."),
      target: z.enum(["main-vault", "project-vault"]).describe("Destination: 'main-vault' for private/global storage, 'project-vault' for shared project storage"),
      vaultFolder: z
        .string()
        .optional()
        .describe(
          "Optional target project vault folder name, such as `.mnemonic-lib`. " +
          "Use this only when moving into a specific sub-vault instead of the primary project vault."
        ),
      cwd: projectParam,
      allowProtectedBranch: z
        .boolean()
        .optional()
        .describe(
          "One-time override for protected branch checks. " +
          "When true, move_memory can commit on a protected branch without changing project policy."
        ),
    }),
    outputSchema: MoveResultSchema,
  },
  async ({ id, target, vaultFolder, cwd, allowProtectedBranch = false }) => {
    await ensureBranchSynced(cwd);

    const found = await vaultManager.findNote(id, cwd);
    if (!found) {
      return { content: [{ type: "text", text: `No memory found with id '${id}'` }], isError: true };
    }

    const currentStorage = storageLabel(found.vault);

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
          isError: true,
        };
      }

      if (vaultFolder) {
        // Target a specific submodule vault by folder name.
        const subVault = await vaultManager.getVaultByFolder(cwd, vaultFolder);
        if (!subVault) {
          return {
            content: [{ type: "text", text: `Vault folder '${vaultFolder}' not found under the git root for: ${cwd}` }],
            isError: true,
          };
        }
        targetVault = subVault;
      } else {
        // Default: primary project vault (.mnemonic).
        const projectVault = await vaultManager.getOrCreateProjectVault(cwd);
        if (!projectVault) {
          return { content: [{ type: "text", text: `Could not resolve a project vault for: ${cwd}` }], isError: true };
        }
        targetVault = projectVault;
      }

      targetProject = await resolveProject(cwd);
      if (!targetProject) {
        return { content: [{ type: "text", text: `Could not detect a project for: ${cwd}` }], isError: true };
      }
    }

    // Check if the note is already in the target vault.
    if (found.vault.storage.vaultPath === targetVault.storage.vaultPath) {
      const targetLabel = storageLabel(targetVault);
      return { content: [{ type: "text", text: `Memory '${id}' is already stored in ${targetLabel}.` }], isError: true };
    }

    if (found.vault.isProject || targetVault.isProject) {
      const resolvedProject = targetProject ?? await resolveProject(cwd);
      const projectLabel = resolvedProject
        ? `${resolvedProject.name} (${resolvedProject.id})`
        : `${found.note.projectName ?? "project"} (${found.note.project ?? "unknown"})`;
      const projectId = targetProject?.id ?? found.note.project;
      const policy = projectId ? await configStore.getProjectPolicy(projectId) : undefined;
      const protectedBranchCheck = await shouldBlockProtectedBranchCommit({
        cwd,
        writeScope: "project",
        automaticCommit: true,
        projectLabel,
        policy,
        allowProtectedBranch,
        toolName: "move_memory",
      });
      if (protectedBranchCheck.blocked) {
        return {
          content: [{ type: "text", text: protectedBranchCheck.message ?? "Protected branch policy blocked this commit." }],
          isError: true,
        };
      }
    }

    const targetLabel = storageLabel(targetVault);
    const existing = await targetVault.storage.readNote(id);
    if (existing) {
      return { content: [{ type: "text", text: `Cannot move '${id}' because a note with that id already exists in ${targetLabel}.` }], isError: true };
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

    const moveResult = await moveNoteBetweenVaults(found, targetVault, noteToWrite, cwd);
    const movedNote = moveResult.note;
    const associationValue = movedNote.projectName && movedNote.project
      ? `${movedNote.projectName} (${movedNote.project})`
      : movedNote.projectName ?? movedNote.project ?? "global";
    
    const structuredContent: MoveResult = {
      action: "moved",
      id,
      fromVault: currentStorage,
      toVault: targetLabel,
      projectAssociation: associationValue,
      title: movedNote.title,
      metadataRewritten,
      persistence: moveResult.persistence,
    };

    const associationText = metadataRewritten
      ? `Project association is now ${associationValue}.`
      : `Project association remains ${associationValue}.`;

    invalidateActiveProjectCache();
    return {
      content: [{
        type: "text",
        text: `Moved '${id}' from ${currentStorage} to ${targetLabel}. ${associationText}\n${formatPersistenceSummary(moveResult.persistence)}`,
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
      "Use after you have identified the exact memories to connect.\n\n" +
      "Create a typed bidirectional relationship between two memories.\n\n" +
      "Use this when:\n" +
      "- A newly stored or updated note meaningfully connects to another note\n" +
      "- One note explains, exemplifies, supersedes, or closely relates to another\n\n" +
      "Do not use this when:\n" +
      "- The connection is weak or speculative\n" +
      "- You need to remove a relationship rather than add one\n\n" +
      "Returns:\n" +
      "- Both memory ids and the created relationship type\n\n" +
      "Side effects: modifies both notes, git commits per affected vault, and may push.\n\n" +
      "Typical next step:\n" +
      "- Use `get` on both notes to verify the relationship context reads well.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: z.object({
      fromId: z.string().describe("Source memory id"),
      toId: z.string().describe("Target memory id"),
      type: z.enum(RELATIONSHIP_TYPES).default("related-to").describe(
        "Relationship type: 'related-to' (same topic), 'explains' (clarifies why), 'example-of' (instance of pattern), 'supersedes' (replaces)"
      ),
      bidirectional: z.boolean().optional().default(true).describe("Add relationship in both directions (default: true)"),
      cwd: projectParam,
    }),
    outputSchema: RelateResultSchema,
  },
  async ({ fromId, toId, type, bidirectional, cwd }) => {
    await ensureBranchSynced(cwd);

    const [foundFrom, foundTo] = await Promise.all([
      vaultManager.findNote(fromId, cwd),
      vaultManager.findNote(toId, cwd),
    ]);
    if (!foundFrom) return { content: [{ type: "text", text: `No memory found with id '${fromId}'` }], isError: true };
    if (!foundTo) return { content: [{ type: "text", text: `No memory found with id '${toId}'` }], isError: true };

    const { note: fromNote, vault: fromVault } = foundFrom;
    const { note: toNote, vault: toVault } = foundTo;
    const now = new Date().toISOString();

    // Group changes by vault so notes in the same vault share one commit
    const vaultChanges = new Map<Vault, string[]>();

    const fromRels = fromNote.relatedTo ?? [];
    const fromRelExists = fromRels.some((r) => r.id === toId);
    if (!fromRelExists) {
      await fromVault.storage.writeNote({ ...fromNote, relatedTo: [...fromRels, { id: toId, type }], updatedAt: now });
      const files = vaultChanges.get(fromVault) ?? [];
      files.push(vaultManager.noteRelPath(fromVault, fromId));
      vaultChanges.set(fromVault, files);
    }

    const toRels = toNote.relatedTo ?? [];
    const toRelExists = toRels.some((r) => r.id === fromId);
    if (bidirectional && !toRelExists) {
      await toVault.storage.writeNote({ ...toNote, relatedTo: [...toRels, { id: fromId, type }], updatedAt: now });
      const files = vaultChanges.get(toVault) ?? [];
      files.push(vaultManager.noteRelPath(toVault, toId));
      vaultChanges.set(toVault, files);
    }

    // Check for uncommitted changes from a previous failed attempt
    if (vaultChanges.size === 0) {
      // If relationships exist in note content, check git status for pending changes
      const allVaults = new Set([fromVault, ...(bidirectional && toVault !== fromVault ? [toVault] : [])]);
      
      for (const vault of allVaults) {
        const noteIds = vault === fromVault
          ? (bidirectional && vault === toVault ? [fromId, toId] : [fromId])
          : [toId];
        const pendingFiles = await vaultManager.getPendingNoteFiles(vault, noteIds);
        
        if (pendingFiles.length > 0) {
          // Commit the pending changes from previous failed attempt
          const commitBody = formatCommitBody({
            noteId: fromId,
            noteTitle: fromNote.title,
            projectName: fromNote.projectName,
            relationship: { fromId, toId, type },
          });
          const commitMessage = `relate: ${fromNote.title} ↔ ${toNote.title}`;
          const commitStatus = await vault.git.commitWithStatus(commitMessage, pendingFiles, commitBody);
          
          if (commitStatus.status === "committed") {
            await pushAfterMutation(vault);
          }
          
          const retry = buildMutationRetryContract({
            commit: commitStatus,
            commitMessage,
            commitBody,
            files: pendingFiles,
            cwd,
            vault,
            mutationApplied: true,
            preferredRecovery: "rerun-tool-call-serial",
          });
          
          const structuredContent: RelateResult = {
            action: "related",
            fromId,
            toId,
            type,
            bidirectional,
            notesModified: pendingFiles.map((f: string) => path.basename(f, '.md')),
            retry,
          };
          
          const retrySummary = formatRetrySummary(retry);
          return {
            content: [{
              type: "text",
              text: `Reconciled pending commit for relationship \`${fromId}\` ${bidirectional ? "↔" : "→"} \`${toId}\` (${type})${retrySummary ? `\n${retrySummary}` : ""}`,
            }],
            structuredContent,
          };
        }
      }
      
      return { content: [{ type: "text", text: `Relationship already exists between '${fromId}' and '${toId}'` }], isError: true };
    }

    const modifiedNoteIds: string[] = [];
    let retry: MutationRetryContract | undefined;
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
      const commitMessage = `relate: ${fromNote.title} ↔ ${toNote.title}`;
      const commitStatus = await vault.git.commitWithStatus(commitMessage, files, commitBody);
      if (!retry) {
        retry = buildMutationRetryContract({
          commit: commitStatus,
          commitMessage,
          commitBody,
          files,
          cwd,
          vault,
          mutationApplied: true,
          preferredRecovery: "rerun-tool-call-serial",
        });
      }
      if (commitStatus.status === "committed") {
        await pushAfterMutation(vault);
      }
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
      retry,
    };
    
    const retrySummary = formatRetrySummary(retry);
    invalidateActiveProjectCache();
    return {
      content: [{
        type: "text",
        text: `Linked \`${fromId}\` ${dirStr} \`${toId}\` (${type})${retrySummary ? `\n${retrySummary}` : ""}`,
      }],
      structuredContent,
    };
  }
);

// ── unrelate ──────────────────────────────────────────────────────────────────
server.registerTool(
  "unrelate",
  {
    title: "Remove Relationship",
    description:
      "Remove a relationship between two memories.\n\n" +
      "Use this when:\n" +
      "- A previously created relationship is no longer accurate\n" +
      "- Two notes should remain independent\n\n" +
      "Do not use this when:\n" +
      "- You are adding a new connection; use `relate`\n\n" +
      "Returns:\n" +
      "- Both memory ids and the removed relationship details\n\n" +
      "Side effects: modifies both notes, git commits per affected vault, and may push.\n\n" +
      "Typical next step:\n" +
      "- Use `get` to verify both notes now stand on their own.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: z.object({
      fromId: z.string().describe("Source memory id"),
      toId: z.string().describe("Target memory id"),
      bidirectional: z.boolean().optional().default(true).describe("Remove relationship in both directions (default: true)"),
      cwd: projectParam,
    }),
    outputSchema: RelateResultSchema,
  },
  async ({ fromId, toId, bidirectional, cwd }) => {
    await ensureBranchSynced(cwd);

    const [foundFrom, foundTo] = await Promise.all([
      vaultManager.findNote(fromId, cwd),
      vaultManager.findNote(toId, cwd),
    ]);

    const now = new Date().toISOString();
    const vaultChanges = new Map<Vault, string[]>();

    if (foundFrom) {
      const { note: fromNote, vault: fromVault } = foundFrom;
      const filtered = (fromNote.relatedTo ?? []).filter((r) => r.id !== toId);
      const fromRelExisted = (fromNote.relatedTo?.length ?? 0) > filtered.length;
      if (fromRelExisted) {
        await fromVault.storage.writeNote({ ...fromNote, relatedTo: filtered, updatedAt: now });
        const files = vaultChanges.get(fromVault) ?? [];
        files.push(vaultManager.noteRelPath(fromVault, fromId));
        vaultChanges.set(fromVault, files);
      }
    }

    if (bidirectional && foundTo) {
      const { note: toNote, vault: toVault } = foundTo;
      const filtered = (toNote.relatedTo ?? []).filter((r) => r.id !== fromId);
      const toRelExisted = (toNote.relatedTo?.length ?? 0) > filtered.length;
      if (toRelExisted) {
        await toVault.storage.writeNote({ ...toNote, relatedTo: filtered, updatedAt: now });
        const files = vaultChanges.get(toVault) ?? [];
        files.push(vaultManager.noteRelPath(toVault, toId));
        vaultChanges.set(toVault, files);
      }
    }

    // Check for uncommitted changes from a previous failed attempt
    if (vaultChanges.size === 0) {
      // If no relationships were found in note content, check git status for pending changes
      const allVaults = new Set<Vault>();
      if (foundFrom) allVaults.add(foundFrom.vault);
      if (bidirectional && foundTo) allVaults.add(foundTo.vault);
      
      for (const vault of allVaults) {
        const noteIds: string[] = [];
        if (foundFrom && foundFrom.vault === vault) noteIds.push(fromId);
        if (bidirectional && foundTo && foundTo.vault === vault) noteIds.push(toId);
        
        const pendingFiles = await vaultManager.getPendingNoteFiles(vault, noteIds);
        
        if (pendingFiles.length > 0) {
          // Commit the pending changes from previous failed attempt
          const found = foundFrom?.vault === vault ? foundFrom : foundTo;
          const commitBody = found
            ? formatCommitBody({
                noteId: found.note.id,
                noteTitle: found.note.title,
                projectName: found.note.projectName,
              })
            : undefined;
          const commitMessage = `unrelate: ${fromId} ↔ ${toId}`;
          const commitStatus = await vault.git.commitWithStatus(commitMessage, pendingFiles, commitBody);
          
          if (commitStatus.status === "committed") {
            await pushAfterMutation(vault);
          }
          
          const retry = buildMutationRetryContract({
            commit: commitStatus,
            commitMessage,
            commitBody,
            files: pendingFiles,
            cwd,
            vault,
            mutationApplied: true,
            preferredRecovery: "rerun-tool-call-serial",
          });
          
          const structuredContent: RelateResult = {
            action: "unrelated",
            fromId,
            toId,
            type: "related-to",
            bidirectional,
            notesModified: pendingFiles.map((f: string) => path.basename(f, '.md')),
            retry,
          };
          
          const retrySummary = formatRetrySummary(retry);
          return {
            content: [{
              type: "text",
              text: `Reconciled pending commit for relationship removal between \`${fromId}\` and \`${toId}\`${retrySummary ? `\n${retrySummary}` : ""}`,
            }],
            structuredContent,
          };
        }
      }
      
      return { content: [{ type: "text", text: `No relationship found between '${fromId}' and '${toId}'` }], isError: true };
    }

    let retry: MutationRetryContract | undefined;
    for (const [vault, files] of vaultChanges) {
      const found = foundFrom?.vault === vault ? foundFrom : foundTo;
      const commitBody = found
        ? formatCommitBody({
            noteId: found.note.id,
            noteTitle: found.note.title,
            projectName: found.note.projectName,
          })
        : undefined;
      const commitMessage = `unrelate: ${fromId} ↔ ${toId}`;
      const commitStatus = await vault.git.commitWithStatus(commitMessage, files, commitBody);
      if (!retry) {
        retry = buildMutationRetryContract({
          commit: commitStatus,
          commitMessage,
          commitBody,
          files,
          cwd,
          vault,
          mutationApplied: true,
          preferredRecovery: "rerun-tool-call-serial",
        });
      }
      if (commitStatus.status === "committed") {
        await pushAfterMutation(vault);
      }
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
      retry,
    };
    
    const retrySummary = formatRetrySummary(retry);
    invalidateActiveProjectCache();
    return {
      content: [{
        type: "text",
        text: `Removed relationship between \`${fromId}\` and \`${toId}\`${retrySummary ? `\n${retrySummary}` : ""}`,
      }],
      structuredContent,
    };
  }
);

// ── consolidate ───────────────────────────────────────────────────────────────
server.registerTool(
  "consolidate",
  {
    title: "Consolidate Memories",
    description:
      "Use after `recall`, `list`, or `memory_graph` shows overlap that should be merged or cleaned up.\n\n" +
      "Merge overlapping memories into a cleaner canonical note and retire the sources.\n\n" +
      "Use this when:\n" +
      "- Multiple notes cover the same decision, fix, or concept\n" +
      "- One memory supersedes several older fragments\n\n" +
      "Do not use this when:\n" +
      "- You only need a small edit to one note; use `update`\n" +
      "- You only want to connect notes; use `relate`\n\n" +
      "Returns:\n" +
      "- The canonical memory, source ids, resulting relationships, and persistence status\n\n" +
      "Side effects: creates or updates the canonical note, modifies or removes source notes according to mode, git commits, and may push.\n\n" +
      "Typical next step:\n" +
      "- Use `get` to inspect the canonical note and `recall` to confirm duplication is reduced.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
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
        .describe(
          "What to do: 'dry-run' = full analysis without changes, 'detect-duplicates' = find similar pairs, " +
          "'find-clusters' = group by theme and relationships, 'suggest-merges' = actionable merge recommendations, " +
          "'execute-merge' = perform a merge (requires mergePlan), 'prune-superseded' = delete notes marked as superseded"
        ),
      mode: z
        .enum(CONSOLIDATION_MODES)
        .optional()
        .describe("Override the project's default: 'supersedes' preserves history, 'delete' removes sources immediately"),
      threshold: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .default(0.85)
        .describe("Cosine similarity threshold for duplicate detection (0.85 default)"),
      mergePlan: z
        .object({
          sourceIds: z.array(z.string()).min(2).describe("Ids of notes to merge into one consolidated note"),
          targetTitle: z.string().describe("Title for the consolidated note"),
          content: z.string().optional().describe("Custom body for the consolidated note — distill durable knowledge rather than dumping all source content verbatim"),
          description: z.string().optional().describe("Context explaining the consolidation rationale (stored in the note)"),
          summary: z.string().optional().describe("Git commit summary only. Imperative mood, concise, and focused on why the change matters."),
          tags: z.array(z.string()).optional().describe("Optional tags for later filtering. Use a small number of stable, meaningful tags."),
        })
        .optional()
        .describe("Required for 'execute-merge' strategy. Get sourceIds from 'suggest-merges' output."),
      allowProtectedBranch: z
        .boolean()
        .optional()
        .describe(
          "One-time override for protected branch checks. " +
          "When true, consolidate can commit on a protected branch without changing project policy."
        ),
    }),
    outputSchema: ConsolidateResultSchema,
  },
  async ({ cwd, strategy, mode, threshold, mergePlan, allowProtectedBranch = false }) => {
    await ensureBranchSynced(cwd);

    const project = await resolveProject(cwd);
    if (!project && cwd) {
      return { content: [{ type: "text", text: `Could not detect a project for: ${cwd}` }], isError: true };
    }

    // Gather notes from all vaults (project + main) for this project
    const { entries } = await collectVisibleNotes(cwd, "all", undefined, "any");
    const projectNotes = project
      ? entries.filter((e) => e.note.project === project.id)
      : entries.filter((e) => !e.note.project);

    if (projectNotes.length === 0) {
      return { content: [{ type: "text", text: "No memories found to consolidate." }], isError: true };
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

      case "execute-merge": {
        if (!mergePlan) {
          return { content: [{ type: "text", text: "execute-merge strategy requires a mergePlan with sourceIds and targetTitle." }], isError: true };
        }
        const mergeResult = await executeMerge(entries, mergePlan, defaultConsolidationMode, project, cwd, mode, policy, allowProtectedBranch);
        invalidateActiveProjectCache();
        return mergeResult;
      }

      case "prune-superseded": {
        const pruneResult = await pruneSuperseded(projectNotes, mode ?? defaultConsolidationMode, project, cwd, policy, allowProtectedBranch);
        invalidateActiveProjectCache();
        return pruneResult;
      }

      case "dry-run":
        return dryRunAll(projectNotes, threshold, defaultConsolidationMode, project, mode);

      default:
        return { content: [{ type: "text", text: `Unknown strategy: ${strategy}` }], isError: true };
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
  const embeddings = await loadEmbeddingsByNoteId(entries);

  for (let i = 0; i < entries.length; i++) {
    const entryA = entries[i]!;
    if (checked.has(entryA.note.id)) continue;

    const embeddingA = embeddings.get(entryA.note.id);
    if (!embeddingA) continue;

    for (let j = i + 1; j < entries.length; j++) {
      const entryB = entries[j]!;
      if (checked.has(entryB.note.id)) continue;

      const embeddingB = embeddings.get(entryB.note.id);
      if (!embeddingB) continue;

      const similarity = cosineSimilarity(embeddingA, embeddingB);
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
    themeGroups,
    relationshipClusters,
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
  const embeddings = await loadEmbeddingsByNoteId(entries);

  for (let i = 0; i < entries.length; i++) {
    const entryA = entries[i]!;
    if (checked.has(entryA.note.id)) continue;

    const embeddingA = embeddings.get(entryA.note.id);
    if (!embeddingA) continue;

    const similar: Array<{ entry: NoteEntry; similarity: number }> = [];

    for (let j = i + 1; j < entries.length; j++) {
      const entryB = entries[j]!;
      if (checked.has(entryB.note.id)) continue;

      const embeddingB = embeddings.get(entryB.note.id);
      if (!embeddingB) continue;

      const similarity = cosineSimilarity(embeddingA, embeddingB);
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

async function loadEmbeddingsByNoteId(entries: NoteEntry[]): Promise<Map<string, number[]>> {
  const embeddings = new Map<string, number[]>();

  await Promise.all(entries.map(async (entry) => {
    const record = await entry.vault.storage.readEmbedding(entry.note.id);
    if (record) {
      embeddings.set(entry.note.id, record.embedding);
    }
  }));

  return embeddings;
}

async function executeMerge(
  entries: NoteEntry[],
  mergePlan: { sourceIds: string[]; targetTitle: string; content?: string; description?: string; summary?: string; tags?: string[] },
  defaultConsolidationMode: ConsolidationMode,
  project: Awaited<ReturnType<typeof resolveProject>>,
  cwd?: string,
  explicitMode?: ConsolidationMode,
  policy?: ProjectMemoryPolicy,
  allowProtectedBranch: boolean = false,
): Promise<{ content: Array<{ type: "text"; text: string }>; structuredContent: ConsolidateResult }> {
  const sourceIds = normalizeMergePlanSourceIds(mergePlan.sourceIds);
  const targetTitle = mergePlan.targetTitle.trim();
  const { content: customContent, description, summary, tags } = mergePlan;

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

  const existingTargetEntry = findExistingExecuteMergeTarget(entries, sourceEntries, targetTitle);
  const projectVault = cwd ? await vaultManager.getProjectVaultIfExists(cwd) : null;
  const targetVault = existingTargetEntry?.vault ?? projectVault ?? vaultManager.main;

  let touchesProjectVault = targetVault.isProject || sourceEntries.some((entry) => entry.vault.isProject);
  if (!touchesProjectVault && consolidationMode === "delete") {
    touchesProjectVault = await wouldRelationshipCleanupTouchProjectVault(sourceIds);
  }
  if (touchesProjectVault) {
    const projectLabel = project
      ? `${project.name} (${project.id})`
      : "this context";
    const protectedBranchCheck = await shouldBlockProtectedBranchCommit({
      cwd,
      writeScope: "project",
      automaticCommit: true,
      projectLabel,
      policy,
      allowProtectedBranch,
      toolName: "consolidate",
    });
    if (protectedBranchCheck.blocked) {
      const message = protectedBranchCheck.message ?? "Protected branch policy blocked this commit.";
      const structuredContent: ConsolidateResult = {
        action: "consolidated",
        strategy: "execute-merge",
        project: project?.id,
        projectName: project?.name,
        notesProcessed: entries.length,
        notesModified: 0,
        warnings: [message],
      };
      return { content: [{ type: "text", text: message }], structuredContent };
    }
  }

  const now = new Date().toISOString();

  // Build consolidated content
  const sections: string[] = [];
  if (customContent) {
    if (description) {
      sections.push(description);
      sections.push("");
    }
    sections.push(customContent);
  } else {
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
  }

  // Combine tags (deduplicated)
  const combinedTags = tags ?? Array.from(new Set(sourceEntries.flatMap((e) => e.note.tags)));

  // Collect all unique relationships from sources (excluding relationships among sources)
  const sourceIdsSet = new Set(sourceIds);
  const relationshipSources = existingTargetEntry
    ? [...sourceEntries.map((entry) => entry.note), existingTargetEntry.note]
    : sourceEntries.map((entry) => entry.note);
  const allRelationships = mergeRelationshipsFromNotes(relationshipSources, sourceIdsSet);

  // Create or update the consolidated note
  const targetId = existingTargetEntry?.note.id ?? makeId(targetTitle);
  const consolidatedNote: Note = {
    id: targetId,
    title: targetTitle,
    content: sections.join("\n").trim(),
    tags: combinedTags,
    lifecycle: "permanent",
    project: project?.id,
    projectName: project?.name,
    relatedTo: allRelationships,
    createdAt: existingTargetEntry?.note.createdAt ?? now,
    updatedAt: now,
    memoryVersion: 1,
  };

  // Write consolidated note
  await targetVault.storage.writeNote(consolidatedNote);

  let embeddingStatus: { status: "written" | "skipped"; reason?: string } = { status: "written" };

  // Generate embedding for consolidated note
  try {
    const text = await embedTextForNote(targetVault.storage, consolidatedNote);
    const vector = await embed(text);
    await targetVault.storage.writeEmbedding({
      id: targetId,
      model: embedModel,
      embedding: vector,
      updatedAt: now,
    });
  } catch (err) {
    embeddingStatus = { status: "skipped", reason: err instanceof Error ? err.message : String(err) };
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
  let targetCommitStatus: CommitResult = { status: "skipped", reason: "no-changes" };
  let targetPushStatus: PushResult = { status: "skipped", reason: "no-remote" };
  let targetCommitBody: string | undefined;
  let targetCommitMessage: string | undefined;
  let targetCommitFiles: string[] | undefined;
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
    const commitMessage = `${action}: ${targetTitle}`;
    const commitStatus = await vault.git.commitWithStatus(commitMessage, files, commitBody);
    const pushStatus = commitStatus.status === "committed"
      ? await pushAfterMutation(vault)
      : { status: "skipped" as const, reason: "commit-failed" as const };
    if (isTargetVault) {
      targetCommitStatus = commitStatus;
      targetPushStatus = pushStatus;
      targetCommitBody = commitBody;
      targetCommitMessage = commitMessage;
      targetCommitFiles = [...files];
    }
  }

  const retry = targetCommitMessage && targetCommitFiles
    ? buildMutationRetryContract({
        commit: targetCommitStatus,
        commitMessage: targetCommitMessage,
        commitBody: targetCommitBody,
        files: targetCommitFiles,
        cwd,
        vault: targetVault,
        mutationApplied: true,
      })
    : undefined;

  const persistence = buildPersistenceStatus({
    storage: targetVault.storage,
    id: targetId,
    embedding: embeddingStatus,
    commit: targetCommitStatus,
    push: targetPushStatus,
    commitMessage: targetCommitMessage,
    commitBody: targetCommitBody,
    retry,
  });

  const lines: string[] = [];
  lines.push(`Consolidated ${sourceIds.length} notes into '${targetId}'`);
  lines.push(`Mode: ${consolidationMode}`);
  lines.push(`Stored in: ${storageLabel(targetVault)}`);
  if (existingTargetEntry) {
    lines.push("Idempotency: reused existing target note.");
  }
  lines.push(formatPersistenceSummary(persistence));

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
    persistence,
    retry,
  };

  return { content: [{ type: "text", text: lines.join("\n") }], structuredContent };
}

function findExistingExecuteMergeTarget(
  entries: NoteEntry[],
  sourceEntries: NoteEntry[],
  targetTitle: string,
): NoteEntry | undefined {
  const normalizedTitle = targetTitle.trim();
  const targetSlug = slugify(normalizedTitle);
  const sourceIds = new Set(sourceEntries.map((entry) => entry.note.id));
  let sharedTargetIds: Set<string> | undefined;

  for (const entry of sourceEntries) {
    const supersededTargetIds = new Set(
      (entry.note.relatedTo ?? [])
        .filter((rel) => rel.type === "supersedes")
        .map((rel) => rel.id)
        .filter((id) => !sourceIds.has(id)),
    );

    if (supersededTargetIds.size === 0) {
      return undefined;
    }

    sharedTargetIds = sharedTargetIds
      ? new Set([...sharedTargetIds].filter((id) => supersededTargetIds.has(id)))
      : supersededTargetIds;

    if (sharedTargetIds.size === 0) {
      return undefined;
    }
  }

  const candidates = entries
    .filter((entry) => sharedTargetIds?.has(entry.note.id))
    .filter((entry) => entry.note.title.trim() === normalizedTitle)
    .filter((entry) => !targetSlug || entry.note.id === targetSlug || entry.note.id.startsWith(`${targetSlug}-`))
    .sort((left, right) => right.note.updatedAt.localeCompare(left.note.updatedAt));

  return candidates[0];
}

async function pruneSuperseded(
  entries: NoteEntry[],
  consolidationMode: ConsolidationMode,
  project: Awaited<ReturnType<typeof resolveProject>>,
  cwd?: string,
  policy?: ProjectMemoryPolicy,
  allowProtectedBranch: boolean = false,
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

  const supersededList = Array.from(supersededIds);
  let touchesProjectVault = supersededList.some((id) => entries.find((e) => e.note.id === id)?.vault.isProject);
  if (!touchesProjectVault) {
    touchesProjectVault = await wouldRelationshipCleanupTouchProjectVault(supersededList);
  }
  if (touchesProjectVault) {
    const projectLabel = project
      ? `${project.name} (${project.id})`
      : "this context";
    const protectedBranchCheck = await shouldBlockProtectedBranchCommit({
      cwd,
      writeScope: "project",
      automaticCommit: true,
      projectLabel,
      policy,
      allowProtectedBranch,
      toolName: "consolidate",
    });
    if (protectedBranchCheck.blocked) {
      const message = protectedBranchCheck.message ?? "Protected branch policy blocked this commit.";
      const structuredContent: ConsolidateResult = {
        action: "consolidated",
        strategy: "prune-superseded",
        project: project?.id,
        projectName: project?.name,
        notesProcessed: entries.length,
        notesModified: 0,
        warnings: [message],
      };
      return { content: [{ type: "text", text: message }], structuredContent };
    }
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
  let retry: MutationRetryContract | undefined;
  for (const [vault, files] of vaultChanges) {
    const prunedIds = files.map((f) => f.replace(/\.mnemonic\/notes\/(.+)\.md$/, "$1").replace(/notes\/(.+)\.md$/, "$1"));
    const commitBody = formatCommitBody({
      noteIds: prunedIds,
      description: `Pruned ${prunedIds.length} superseded note(s)\nNotes: ${prunedIds.join(", ")}`,
    });
    const commitMessage = `prune: removed ${files.length} superseded note(s)`;
    const commitStatus = await vault.git.commitWithStatus(commitMessage, files, commitBody);
    if (!retry) {
      retry = buildMutationRetryContract({
        commit: commitStatus,
        commitMessage,
        commitBody,
        files,
        cwd,
        vault,
        mutationApplied: true,
      });
    }
    if (commitStatus.status === "committed") {
      await pushAfterMutation(vault);
    }
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
    retry,
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

// ── mnemonic-workflow-hint prompt ─────────────────────────────────────────────
server.registerPrompt(
  "mnemonic-workflow-hint",
  {
    title: "Mnemonic Workflow Hints",
    description: "Optional workflow hints for using the mnemonic memory tools effectively.",
  },
  async () => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text:
            "## Mnemonic MCP workflow hints\n\n" +
            "Avoid duplicate memories. Prefer inspecting and updating existing memories before creating new ones.\n\n" +
            "- REQUIRES: Before `remember`, call `recall` or `list` first.\n" +
            "- If `recall` or `list` returns a plausible match, call `get` before deciding whether to `update` or `remember`.\n" +
            "- If an existing memory already covers the topic, use `update`, not `remember`.\n" +
            "- When unsure, prefer `recall` over `remember`.\n" +
            "- For repo-related tasks, pass `cwd` so mnemonic can route project memories correctly.\n\n" +
            "Workflow: `recall`/`list` -> `get` -> `update` or `remember` -> `relate`/`consolidate`/`move_memory`. Use `discover_tags` only when tag choice is ambiguous.\n\n" +
            "Roles are optional prioritization hints, not schema. Lifecycle still governs durability. `role: plan` does not imply `temporary`. Inferred roles are internal hints only. Prioritization is language-independent by default.\n\n" +
            "### Anti-patterns\n\n" +
            "- Bad: call `remember` immediately because the user said 'remember'.\n" +
            "- Good: `recall` or `list` first, then `get`, then `update` or `remember`.\n" +
            "- Bad: create another note when `recall` or `list` already found the same decision.\n" +
            "- Good: `update` the existing memory and relate it if needed.\n\n" +
            "### Storage model\n\n" +
            "Memories can live in:\n" +
            "- `main-vault` for global knowledge\n" +
            "- `project-vault` as the broad project-level filter\n" +
            "- `sub-vault:<folder>` for a specific project sub-vault such as `sub-vault:.mnemonic-lib`\n\n" +
            "Passing `cwd` enables:\n" +
            "- project memory routing\n" +
            "- project-aware recall ranking\n" +
            "- project memory policy lookup\n\n" +
            "### Tiny examples\n\n" +
            "- Existing bug note found by `recall` -> inspect with `get` -> refine with `update`.\n" +
            "- No matching note found by `recall` -> optional `discover_tags` with note context -> create with `remember`.\n" +
            "- Two notes overlap heavily -> inspect -> clean up with `consolidate`.",
        },
      },
    ],
  })
);

// ── start ─────────────────────────────────────────────────────────────────────
await warnAboutPendingMigrationsOnStartup();
const transport = new StdioServerTransport();

async function shutdown() {
  await server.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
transport.onclose = async () => { await server.close(); };

await server.connect(transport);
console.error(`[mnemonic] Started. Main vault: ${VAULT_PATH}`);
