#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { randomUUID } from "crypto";
import path from "path";
import { promises as fs } from "fs";

import type { Confidence } from "./structured-content.js";
import { NOTE_LIFECYCLES, NOTE_ROLES, RELATIONSHIP_TYPES, Storage, type Note, type NoteLifecycle, type NoteRole, type Relationship, type RelationshipType } from "./storage.js";
import type { MemoryId } from "./brands.js";
import { memoryId, isoDateString, isValidMemoryId } from "./brands.js";
import { getErrorMessage } from "./error-utils.js";
import { embed, cosineSimilarity, embedModel } from "./embeddings.js";
import { type CommitResult, type PushResult, type SyncResult } from "./git.js";
import { buildTemporalHistoryEntry, computeConfidence, getNoteProvenance } from "./provenance.js";
import { enrichTemporalHistory, type InterpretedHistoryEntry } from "./temporal-interpretation.js";
import { getOrBuildProjection } from "./projections.js";
import {
  invalidateActiveProjectCache,
  getOrBuildVaultEmbeddings,
  getOrBuildVaultNoteList,
  getRecentSessionNoteAccesses,
  getRecentSessionAccessNote,
  getSessionCachedNote,
  getSessionCachedProjection,
  recordSessionNoteAccess,
  setSessionCachedNote,
  setSessionCachedProjection,
} from "./cache.js";
import { performance } from "perf_hooks";

import {
  aggregateMergeRisk,
  buildConsolidateNoteEvidence,
  buildGroupWarnings,
  deriveMergeRisk,
  mergeRelationshipsFromNotes,
  normalizeMergePlanSourceIds,
  resolveEffectiveConsolidationMode,
} from "./consolidate.js";
import { detectDuplicates, findClusters, suggestMerges, executeMerge, pruneSuperseded, dryRunAll } from "./tools/consolidate-helpers.js";
import { registerDetectProjectTool } from "./tools/detect-project.js";
import { registerGetProjectIdentityTool } from "./tools/get-project-identity.js";
import { registerSetProjectIdentityTool } from "./tools/set-project-identity.js";
import { registerListMigrationsTool, registerExecuteMigrationTool } from "./tools/migration.js";
import { registerSetProjectMemoryPolicyTool, registerGetProjectMemoryPolicyTool } from "./tools/policy.js";
import { registerRememberTool } from "./tools/remember.js";
import { registerRecallTool } from "./tools/recall.js";
import { registerUpdateTool } from "./tools/update.js";
import { registerForgetTool } from "./tools/forget.js";
import { registerGetTool } from "./tools/get.js";
import { registerWhereIsMemoryTool } from "./tools/where-is-memory.js";
import { registerListTool } from "./tools/list.js";
import { registerDiscoverTagsTool } from "./tools/discover-tags.js";
import { registerRecentMemoriesTool } from "./tools/recent-memories.js";
import { registerMemoryGraphTool } from "./tools/memory-graph.js";
import { registerProjectMemorySummaryTool } from "./tools/project-memory-summary.js";
import { registerSyncTool } from "./tools/sync.js";
import { registerMoveMemoryTool } from "./tools/move-memory.js";
import { registerRelateTool } from "./tools/relate.js";
import { registerUnrelateTool } from "./tools/unrelate.js";
import { registerConsolidateTool } from "./tools/consolidate.js";
import { suggestAutoRelationships } from "./auto-relate.js";
import {
  computeHybridScore,
  selectRecallResults,
  selectWorkflowResults,
  applyLexicalReranking,
  enrichRescueCandidateScores,
  resolveDiscoveredVaults,
  applyCanonicalExplanationPromotion,
  applyGraphSpreadingActivation,
  assignDenseRanks,
  detectTemporalQueryHint,
  computeTemporalRecencyBoost,
  shouldApplyTemporalFiltering,
  isWithinTemporalFilterWindow,
  type TemporalQueryHint,
  type ScoredRecallCandidate,
} from "./recall.js";
import {
  shouldTriggerLexicalRescue,
  computeLexicalScore,
} from "./lexical.js";
import { getRelationshipPreview } from "./relationships.js";
import { MarkdownLintError, cleanMarkdown } from "./markdown.js";
import { applySemanticPatches, type SemanticPatch } from "./semantic-patch.js";
import { hasActualChanges, computeFieldsModified } from "./update-detect-changes.js";
import { MnemonicConfigStore, readVaultSchemaVersion, type MutationPushMode } from "./config.js";
import {
  CONSOLIDATION_MODES,
  PROTECTED_BRANCH_BEHAVIORS,
  PROJECT_POLICY_SCOPES,
  WRITE_SCOPES,
  resolveConsolidationMode,
  resolveWriteScope,
  type ConsolidationMode,
  type ProjectMemoryPolicy,
  type WriteScope,
} from "./project-memory-policy.js";
import type { ServerContext } from "./server-context.js";
import { resolveProject as resolveProjectFromModule, toProjectRef, noteProjectRef, resolveWriteVault as resolveWriteVaultFromModule, describeProject as describeProjectFromModule, ensureBranchSynced as ensureBranchSyncedFromModule, projectParam } from "./helpers/project.js";
import { extractSummary, formatCommitBody, formatAskForWriteScope, formatAskForProtectedBranch, formatProtectedBranchBlocked, shouldBlockProtectedBranchCommit as shouldBlockProtectedBranchCommitFromModule, wouldRelationshipCleanupTouchProjectVault as wouldRelationshipCleanupTouchProjectVaultFromModule } from "./helpers/git-commit.js";
import { embedTextForNote as embedTextForNoteFromModule, embedMissingNotes as embedMissingNotesFromModule, backfillEmbeddingsAfterSync as backfillEmbeddingsAfterSyncFromModule, removeStaleEmbeddings as removeStaleEmbeddingsFromModule } from "./helpers/embed.js";
import { resolveDurability, buildPersistenceStatus, buildMutationRetryContract, formatRetrySummary, formatPersistenceSummary, getMutationPushMode as getMutationPushModeFromModule, pushAfterMutation as pushAfterMutationFromModule } from "./helpers/persistence.js";
import { type SearchScope, type StorageScope, type NoteEntry, storageLabel, vaultMatchesStorageScope, collectVisibleNotes as collectVisibleNotesFromModule, formatListEntry, formatProjectPolicyLine as formatProjectPolicyLineFromModule, ROLE_LIFECYCLE_DEFAULTS, projectNotFoundResponse, moveNoteBetweenVaults as moveNoteBetweenVaultsFromModule, removeRelationshipsToNoteIds as removeRelationshipsToNoteIdsFromModule, addVaultChange } from "./helpers/vault.js";
import { slugify, makeId, describeLifecycle, formatNote, formatTemporalHistory, formatRelationshipPreview, toRecallFreshness, toRecallRankBand, formatRetrievalEvidenceHint } from "./helpers/index.js";
import {
  classifyThemeWithGraduation,
  computeThemesWithGraduation,
  summarizePreview,
  titleCaseTheme,
  daysSinceUpdate,
  withinThemeScore,
  anchorScore,
  computeConnectionDiversity,
  workingStateScore,
  extractNextAction,
} from "./project-introspection.js";
import { getEffectiveMetadata } from "./role-suggestions.js";
import { detectProject, getCurrentGitBranch } from "./project.js";
import { VaultManager, type Vault } from "./vault.js";
import { buildRecallCandidateContext, collectLexicalRescueCandidates, PROJECT_SCOPE_BOOST as PROJECT_SCOPE_BOOST_VALUE, type DiscoverTagStat, tokenizeTagDiscoveryText, countTokenOverlap, escapeRegex, hasExactTagContextMatch } from "./tools/recall-helpers.js";
import { Migrator } from "./migration.js";
import { parseMemorySections } from "./import.js";
import { defaultClaudeHome, defaultVaultPath, resolveUserPath } from "./paths.js";
import type {
  ProjectRef,
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
  PersistenceStatus,
  MutationRetryContract,
  DiscoverTagsResult,
  ThemeSection,
  AnchorNote,
  RelationshipPreview,
  RetrievalEvidence,
  LintErrorResult,
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
  DiscoverTagsResultSchema,
  LintErrorResultSchema,
  NoteIdSchema,
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

  function makeImportNoteId(title: string): MemoryId {
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
    const suffix = randomUUID().split("-")[0]!;
    return memoryId(slug ? `${slug}-${suffix}` : suffix);
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

    const now = isoDateString(new Date().toISOString());
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
    await Promise.all(
      notesToWrite.map(async (note) => {
        await vault.storage.writeNote(note);
        filesToCommit.push(`notes/${note.id}.md`);
      }),
    );

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
const PROJECT_SCOPE_BOOST = PROJECT_SCOPE_BOOST_VALUE;
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

const ctx: ServerContext = {
  server: undefined as never,
  vaultManager,
  configStore,
  config,
  migrator,
  vaultPath: VAULT_PATH,
  defaultRecallLimit: DEFAULT_RECALL_LIMIT,
  defaultMinSimilarity: DEFAULT_MIN_SIMILARITY,
  projectScopeBoost: PROJECT_SCOPE_BOOST,
  temporalHistoryNoteLimit: TEMPORAL_HISTORY_NOTE_LIMIT,
  temporalHistoryCommitLimit: TEMPORAL_HISTORY_COMMIT_LIMIT,
};

// ── Helper wrappers (delegate to extracted modules with ctx) ─────────────────

async function resolveProject(cwd?: string) {
  return resolveProjectFromModule(ctx, cwd);
}

async function resolveWriteVault(cwd: string | undefined, scope: WriteScope) {
  return resolveWriteVaultFromModule(ctx, cwd, scope);
}

function describeProject(project: Awaited<ReturnType<typeof resolveProject>>): string {
  return describeProjectFromModule(project);
}

async function ensureBranchSynced(cwd?: string) {
  return ensureBranchSyncedFromModule(ctx, cwd);
}

async function shouldBlockProtectedBranchCommit(options: Omit<Parameters<typeof shouldBlockProtectedBranchCommitFromModule>[0], "ctx">) {
  return shouldBlockProtectedBranchCommitFromModule({ ctx, ...options });
}

async function wouldRelationshipCleanupTouchProjectVault(noteIds: string[]) {
  return wouldRelationshipCleanupTouchProjectVaultFromModule(ctx, noteIds);
}

async function embedTextForNote(storage: Storage, note: Note) {
  return embedTextForNoteFromModule(storage, note);
}

async function embedMissingNotes(storage: Storage, noteIds?: string[], force = false) {
  return embedMissingNotesFromModule(ctx, storage, noteIds, force);
}

async function backfillEmbeddingsAfterSync(storage: Storage, label: string, lines: string[], force = false) {
  return backfillEmbeddingsAfterSyncFromModule(ctx, storage, label, lines, force);
}

async function removeStaleEmbeddings(storage: Storage, noteIds: string[]) {
  return removeStaleEmbeddingsFromModule(storage, noteIds);
}

async function getMutationPushMode() {
  return getMutationPushModeFromModule(ctx);
}

async function pushAfterMutation(vault: Vault) {
  return pushAfterMutationFromModule(ctx, vault);
}

async function collectVisibleNotes(cwd?: string, scope: SearchScope = "all", tags?: string[], storedIn: StorageScope = "any", sessionProjectId?: string) {
  return collectVisibleNotesFromModule(ctx, cwd, scope, tags, storedIn, sessionProjectId);
}

async function formatProjectPolicyLine(projectId?: string) {
  return formatProjectPolicyLineFromModule(ctx, projectId);
}

async function moveNoteBetweenVaults(found: { note: Note; vault: Vault }, targetVault: Vault, noteToWrite?: Note, cwd?: string) {
  return moveNoteBetweenVaultsFromModule(ctx, found, targetVault, noteToWrite, cwd);
}

async function removeRelationshipsToNoteIds(noteIds: string[]) {
  return removeRelationshipsToNoteIdsFromModule(ctx, noteIds);
}

function formatSyncResult(result: SyncResult, label: string, vaultPath?: string): string[] {
  if (!result.hasRemote) return [`${label}: no remote configured — git sync skipped.`];
  const lines: string[] = [];

  if (result.gitError) {
    const { phase, message, isConflict } = result.gitError;
    if (isConflict) {
      lines.push(`${label}: ✗ merge conflict during ${phase}.`);
      if (result.gitError.conflictFiles.length > 0) {
        lines.push(`${label}: conflicted files: ${result.gitError.conflictFiles.join(", ")}`);
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

// ── MCP Server ────────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "mnemonic",
  version: await readPackageVersion(),
});

registerDetectProjectTool(server, ctx);

registerGetProjectIdentityTool(server, ctx);

registerSetProjectIdentityTool(server, ctx);

registerListMigrationsTool(server, ctx);

registerExecuteMigrationTool(server, ctx);

registerSetProjectMemoryPolicyTool(server, ctx);

registerGetProjectMemoryPolicyTool(server, ctx);

registerRememberTool(server, ctx);

registerRecallTool(server, ctx);

registerUpdateTool(server, ctx);

registerForgetTool(server, ctx);

registerGetTool(server, ctx);

registerWhereIsMemoryTool(server, ctx);

registerListTool(server, ctx);

registerDiscoverTagsTool(server, ctx);

registerRecentMemoriesTool(server, ctx);

registerMemoryGraphTool(server, ctx);

registerProjectMemorySummaryTool(server, ctx);

registerSyncTool(server, ctx);

registerMoveMemoryTool(server, ctx);

registerRelateTool(server, ctx);

registerUnrelateTool(server, ctx);

registerConsolidateTool(server, ctx);

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
            "When a merge/prune decision is uncertain, use optional evidence enrichment: `recall` with `evidence: \"compact\"` and `consolidate` analysis strategies with `evidence: true`. Evidence improves confidence but is not required.\n\n" +
            "Roles are optional prioritization hints, not schema. Lifecycle still governs durability. When `lifecycle` is omitted, `remember` applies soft defaults based on role: `research`, `plan`, and `review` default to `temporary`; `decision`, `summary`, and `reference` default to `permanent`. Explicit `lifecycle` always overrides the role-based default. Inferred roles are internal hints only. Prioritization is language-independent by default.\n\n" +
            "### Working-state continuity\n\n" +
            "Preserve in-progress work as temporary notes when continuation value is high. Recovery happens after project orientation.\n\n" +
            "**Checkpoint note structure (temporary notes):**\n" +
            "- Title pattern: 'WIP: <topic>' or 'Checkpoint: <description>'\n" +
            "- Opening paragraph: current status and next immediate step\n" +
            "- Body: what was attempted, what worked, blockers, alternatives considered\n" +
            "- End with explicit next action and confidence level\n\n" +
            "**Checkpoint note guidance:**\n" +
            "- One checkpoint per active task or investigation thread\n" +
            "- Update the same checkpoint note as work progresses (don't create new ones)\n" +
            "- Link to related decisions: use `relate` to connect temporary checkpoints to permanent decisions\n" +
            "- Consolidate into a durable note when complete; let lifecycle defaults delete temporary scaffolding unless you intentionally need preserved history\n\n" +
            "**Recovery workflow:**\n" +
            "- Call `project_memory_summary` first for orientation (do not skip to recovery)\n" +
            "- Use `lifecycle: temporary` for active plans, WIP checkpoints, draft investigations, and unvalidated options\n" +
            "- Use `lifecycle: permanent` for decisions, discovered constraints, bug causes, and reusable lessons\n" +
            "- After orientation, recover working-state from temporary notes via `recall` with lifecycle filter\n" +
            "- Consolidate temporary notes into durable ones once knowledge stabilizes\n" +
            "- Recovery is a follow-on step, not a replacement for orientation\n\n" +
            "### Anti-patterns\n\n" +
            "- Bad: call `remember` immediately because the user said 'remember'.\n" +
            "- Good: `recall` or `list` first, then `get`, then `update` or `remember`.\n" +
            "- Bad: create another note when `recall` or `list` already found the same decision.\n" +
            "- Good: `update` the existing memory and relate it if needed.\n" +
            "- Bad: skip orientation and jump straight to working-state recovery.\n" +
            "- Good: `project_memory_summary` first, then recover temporary notes.\n\n" +
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
            "- Two notes overlap heavily -> inspect -> clean up with `consolidate`.\n" +
            "- Unsure why a recall hit ranked high -> rerun `recall` with `evidence: \"compact\"`.\n" +
            "- Unsure whether to merge/prune -> run `consolidate` analysis with `evidence: true` before `execute-merge` or `prune-superseded`.\n" +
            "- Resume work: `project_memory_summary` -> `recall` (lifecycle: temporary) -> continue from temporary notes.\n\n" +
            "### semanticPatch format\n\n" +
            "When using `update` with `semanticPatch`:\n" +
            "- Each patch is an object with two keys: `selector` and `operation` (not flat `{op, value}` at top level).\n" +
            "- `selector` has exactly one key: `heading`, `headingStartsWith`, `nthChild`, or `lastChild`.\n" +
            "- `operation` has an `op` key plus `value` (except `remove` which has no value).\n" +
            "- The parameter must be a JSON array, NOT a string.\n" +
            "- Use `get` first to read exact heading text, then use those headings (without `##` prefix) as selector values.\n" +
            "- Common mistake: writing `{ \"op\": \"appendChild\", \"value\": \"...\" }` at the top level instead of nesting inside `operation`. Correct shape: `{ \"selector\": { \"heading\": \"Findings\" }, \"operation\": { \"op\": \"insertAfter\", \"value\": \"text\" } }`\n" +
            "- `appendChild`, `prependChild`, and `replaceChildren` do NOT work with `heading` selectors. To add content under a heading, use `insertAfter`. To replace a heading, use `replace`.",
        },
      },
    ],
  })
);

// ── mnemonic-rpi-workflow prompt ───────────────────────────────────────────────
const rpiWorkflowPrompt = async () => ({
  messages: [
    {
      role: "user" as const,
      content: {
        type: "text" as const,
        text:
          "## RPIR workflow: research → plan → implement → review\n\n" +
          "mnemonic is the artifact store, not the runtime. Store workflow artifacts with correct roles and lifecycle; do not build orchestration in core.\n\n" +
          "### Request root note\n\n" +
          "For each RPIR workflow, create one request root note: `role: context`, `lifecycle: temporary`, `tags: [\"workflow\", \"request\"]`. All artifacts relate to it.\n\n" +
          "### Stage 1 — Research\n\n" +
          "- Create or update request root note.\n" +
          "- Create research notes: `role: research`, `lifecycle: temporary`.\n" +
          "- Distill a short research summary when findings are scattered.\n" +
          "- Link research `related-to` request root.\n" +
          "- Before creating research notes, call `recall` to check whether existing notes already cover the topic.\n\n" +
          "### Stage 2 — Plan\n\n" +
          "- Create or update one plan note: `role: plan`, `lifecycle: temporary`.\n" +
          "- Link plan `related-to` request root + key research notes.\n" +
          "- Keep plan concise and executable.\n" +
          "- REQUIRES: One current plan per request. Update or supersede when plan evolves.\n" +
          "- Material changes (architecture, scope, ordering, validation, assumptions): update plan note first, then continue.\n" +
          "- Non-material changes (wording, phrasing, detail): update inline without branching.\n\n" +
          "### Stage 3 — Implement\n\n" +
          "- Create temporary apply/task notes, tagged with `apply`.\n" +
          "- Use `role: plan` for executable steps. Use `role: context` for observations and checkpoints.\n" +
          "- Link apply notes `related-to` plan.\n" +
          "- For non-trivial work, hand narrow context to subagent: request note, current plan or relevant slice, key research notes, narrow file/task scope.\n" +
          "- Subagent returns: updated apply note, optional review note, recommendation (continue / block / update plan).\n\n" +
          "### Stage 4 — Review\n\n" +
          "- Create review notes: `role: review`, `lifecycle: temporary`.\n" +
          "- Link review `related-to` apply or plan.\n" +
          "- Fix directly or mark blockers.\n" +
          "- If review changes the plan materially, update plan note first.\n\n" +
          "### Stage 5 — Consolidate\n\n" +
          "At workflow end:\n" +
          "- Create decision note for resolved approaches (`lifecycle: permanent`).\n" +
          "- Create summary note for outcome recaps (`lifecycle: permanent`).\n" +
          "- Promote reusable facts and patterns into permanent reference notes.\n" +
          "- Let pure scaffolding and redundant checkpoints expire as temporary notes.\n\n" +
          "### Relationship conventions\n\n" +
          "Minimal set. Link to immediate upstream artifacts only. No dense cross-linking.\n" +
          "- research → request root\n" +
          "- plan → request root + key research notes\n" +
          "- apply/task → plan\n" +
          "- review → apply or plan\n" +
          "- outcome → plan (optionally request root)\n\n" +
          "### Commit discipline\n\n" +
          "Three classes: memory (research/plan/review artifacts), work (code/test/docs), memory (consolidation/promotion). When plan changes materially: update notes, commit memory, then continue work.\n\n" +
          "### Iterate?\n\n" +
          "Only when review or checks warrant it. Not the default.",
      },
    },
  ],
});

server.registerPrompt(
  "mnemonic-rpi-workflow",
  {
    title: "RPI Workflow: Research → Plan → Implement → Review",
    description: "Stage protocol and conventions for structured task workflows using mnemonic as artifact store.",
  },
  rpiWorkflowPrompt
);

// ── start ─────────────────────────────────────────────────────────────────────
import { warnAboutPendingMigrationsOnStartup } from "./startup.js";

await warnAboutPendingMigrationsOnStartup(ctx);
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
