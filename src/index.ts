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
      lifecycle: z.enum(["temporary", "permanent"]).optional().describe("Filter results by lifecycle. Useful for recovering working-state with `lifecycle: temporary` after `project_memory_summary` orientation."),
    }),
    outputSchema: RecentResultSchema,
  },
  async ({ cwd, scope, storedIn, limit, includePreview, includeStorage, lifecycle }) => {
    await ensureBranchSynced(cwd);

    const { project, entries } = await collectVisibleNotes(cwd, scope, undefined, storedIn);
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
      "- Optional compact working-state recovery hints when relevant temporary notes exist\n\n" +
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
      return projectNotFoundResponse(cwd);
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

    // Collapse thin dynamic-theme buckets (< 2 notes) into "other" to reduce noise.
    // Fixed themes are kept even when small; only keyword-graduated themes are collapsed.
    const fixedThemeSet = new Set(fixedThemes);
    for (const [theme, bucket] of Array.from(themed.entries())) {
      if (!fixedThemeSet.has(theme) && theme !== "other" && bucket.length < 2) {
        const otherBucket = themed.get("other") ?? [];
        otherBucket.push(...bucket);
        themed.set("other", otherBucket);
        themed.delete(theme);
      }
    }

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

    const temporaryEntries = projectEntries
      .filter((entry) => entry.note.lifecycle === "temporary")
      .map((entry) => {
        const metadata = effectiveMetadataById.get(entry.note.id)?.metadata;
        const score = workingStateScore(entry.note, metadata);
        const nextAction = extractNextAction(entry.note);
        const relatedCount = entry.note.relatedTo?.length ?? 0;
        const days = daysSinceUpdate(entry.note.updatedAt);
        const rationaleParts = [`updated ${days < 1 ? "today" : `${Math.round(days)}d ago`}`];
        if (relatedCount > 0) rationaleParts.push(`${relatedCount} linked note${relatedCount === 1 ? "" : "s"}`);
        if (nextAction) rationaleParts.push("explicit next action");
        if (metadata?.role === "plan" || metadata?.role === "context") rationaleParts.push(`${metadata.role} note`);

        return {
          entry,
          score,
          rationale: rationaleParts.join(", "),
          preview: summarizePreview(entry.note.content, 120),
          nextAction,
        };
      })
      .filter((candidate) => candidate.score > -Infinity)
      .sort((a, b) => b.score - a.score || b.entry.note.updatedAt.localeCompare(a.entry.note.updatedAt))
      .slice(0, 3);

    const workingState = temporaryEntries.length > 0
      ? {
          summary:
            temporaryEntries.length === 1
              ? `1 temporary note may help resume active work.`
              : `${temporaryEntries.length} temporary notes may help resume active work.`,
          recoveryHint: "Orient with project_memory_summary first, then inspect these temporary notes if you need to continue in-progress work.",
          notes: temporaryEntries.map(({ entry, rationale, preview, nextAction }) => ({
            id: entry.note.id,
            title: entry.note.title,
            updatedAt: entry.note.updatedAt,
            rationale,
            preview,
            nextAction,
          })),
        }
      : undefined;

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
            const emb = await vault.storage.readEmbedding(memoryId(a.id));
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
      const note = await vault.storage.readNote(memoryId(anchor.id));
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

    // Select theme-diverse suggestedNext: avoid repeating the primary anchor's theme.
    // Backfills without constraint if not enough theme-distinct candidates exist.
    const primaryTheme = primaryAnchor ? (themeCache.get(primaryAnchor.id) ?? "other") : "other";
    const usedSuggestedThemes = new Set([primaryTheme]);
    const suggestedCandidates: typeof anchors = [];
    for (const anchor of anchors.slice(1)) {
      if (suggestedCandidates.length >= 3) break;
      const anchorTheme = themeCache.get(anchor.id) ?? "other";
      if (!usedSuggestedThemes.has(anchorTheme)) {
        suggestedCandidates.push(anchor);
        usedSuggestedThemes.add(anchorTheme);
      }
    }
    for (const anchor of anchors.slice(1)) {
      if (suggestedCandidates.length >= 3) break;
      if (!suggestedCandidates.includes(anchor)) {
        suggestedCandidates.push(anchor);
      }
    }

    const suggestedEnriched = await Promise.all(suggestedCandidates.map(enrichOrientationNote));
    const suggestedRelationships = await Promise.all(suggestedCandidates.map(enrichOrientationNoteWithRelationships));

    const recentPermanent = recent.find((entry) => entry.note.lifecycle === "permanent");
    const fallbackEntry = recentPermanent ?? recent[0];
    const permanentOverrideUsed = Boolean(recentPermanent && recent[0] && recentPermanent.note.id !== recent[0].note.id);

    // Enrich fallback primaryEntry when no anchors exist
    let fallbackEnriched: { provenance?: { lastUpdatedAt: string; lastCommitHash: string; lastCommitMessage: string; recentlyChanged: boolean }; confidence?: Confidence } = {};
    let fallbackRelationships: { relationships?: RelationshipPreview } = {};
    if (!primaryAnchor && fallbackEntry) {
      const fallbackNote = fallbackEntry.note;
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
            id: fallbackEntry?.note.id ?? projectEntries[0]?.note.id ?? "",
            title: fallbackEntry?.note.title ?? projectEntries[0]?.note.title ?? "No notes",
            rationale: permanentOverrideUsed
              ? "Most recent permanent note — no high-centrality anchors found"
              : fallbackEntry
              ? "Most recent note — no high-centrality anchors found"
              : "Only note available",
            ...fallbackEnriched,
            ...fallbackRelationships,
          },
      suggestedNext: suggestedCandidates.map((a, i) => ({
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

    if (workingState) {
      sections.push(`\nWorking state:`);
      sections.push(workingState.summary);
      sections.push(`Recovery hint: ${workingState.recoveryHint}`);
      for (const note of workingState.notes) {
        sections.push(`- ${note.title} (\`${note.id}\`) — ${note.rationale}`);
        sections.push(`  Preview: ${note.preview}`);
        if (note.nextAction) {
          sections.push(`  Next action: ${note.nextAction}`);
        }
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
      workingState,
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
      "- Use `where_is_memory` or `get` to verify the final state.\n" +
      "- Use `relate` if the moved memory connects to existing notes in the new vault.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: z.object({
      id: NoteIdSchema.describe("Exact memory id. Use an id returned by `recall`, `list`, `recent_memories`, or `where_is`."),
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
        return projectNotFoundResponse(cwd);
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
    const existing = await targetVault.storage.readNote(memoryId(id));
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
        updatedAt: isoDateString(new Date().toISOString()),
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
        "Relationship type: 'related-to' (same topic), 'explains' (clarifies why), 'example-of' (instance of pattern), 'supersedes' (replaces), 'derives-from' (derived artifact), 'follows' (sequence order)"
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
    const now = isoDateString(new Date().toISOString());

    // Group changes by vault so notes in the same vault share one commit
    const vaultChanges = new Map<Vault, string[]>();

    const fromRels = fromNote.relatedTo ?? [];
    const fromRelExists = fromRels.some((r) => r.id === toId);
    if (!fromRelExists) {
      await fromVault.storage.writeNote({ ...fromNote, relatedTo: [...fromRels, { id: memoryId(toId), type }], updatedAt: now });
      const files = vaultChanges.get(fromVault) ?? [];
      files.push(vaultManager.noteRelPath(fromVault, fromId));
      vaultChanges.set(fromVault, files);
    }

    const toRels = toNote.relatedTo ?? [];
    const toRelExists = toRels.some((r) => r.id === fromId);
    if (bidirectional && !toRelExists) {
      await toVault.storage.writeNote({ ...toNote, relatedTo: [...toRels, { id: memoryId(fromId), type }], updatedAt: now });
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

    const now = isoDateString(new Date().toISOString());
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
      "- Use `get` to inspect the canonical note and `recall` to confirm duplication is reduced.\n" +
      "- Evidence defaults on for consolidate analysis strategies and execute-merge (lifecycle, risk, warnings).",
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
          "'execute-merge' = perform a merge (requires mergePlan), 'prune-superseded' = delete notes marked as superseded. " +
          "Use `evidence: true` on analysis strategies for trust/risk signals."
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
      evidence: z
        .boolean()
        .optional()
        .describe("Confidence signals for analysis strategies and execute-merge (lifecycle, risk, warnings). Default true for safety."),
      mergePlan: z
        .object({
          sourceIds: z.array(z.string()).min(2).describe("Ids of notes to merge into one consolidated note"),
          targetTitle: z.string().describe("Title for the consolidated note"),
          content: z.string().max(100000, "Content must be at most 100,000 characters").optional().describe("Custom body for the consolidated note — distill durable knowledge rather than dumping all source content verbatim"),
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
  async ({ cwd, strategy, mode, threshold, evidence = true, mergePlan, allowProtectedBranch = false }) => {
    await ensureBranchSynced(cwd);

    const project = await resolveProject(cwd);
    if (!project && cwd) {
      return projectNotFoundResponse(cwd);
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
        return detectDuplicates(projectNotes, threshold, project ?? undefined, evidence);

      case "find-clusters":
        return findClusters(projectNotes, project ?? undefined);

      case "suggest-merges":
        return suggestMerges(projectNotes, threshold, defaultConsolidationMode, project ?? undefined, mode, evidence);

      case "execute-merge": {
        if (!mergePlan) {
          return { content: [{ type: "text", text: "execute-merge strategy requires a mergePlan with sourceIds and targetTitle." }], isError: true };
        }
        const mergeResult = await executeMerge(ctx, entries, mergePlan, defaultConsolidationMode, project ?? undefined, cwd, mode, policy, allowProtectedBranch, evidence);
        invalidateActiveProjectCache();
        return mergeResult;
      }

      case "prune-superseded": {
        const pruneResult = await pruneSuperseded(ctx, projectNotes, mode ?? defaultConsolidationMode, project ?? undefined, cwd, policy, allowProtectedBranch);
        invalidateActiveProjectCache();
        return pruneResult;
      }

      case "dry-run":
        return dryRunAll(projectNotes, threshold, defaultConsolidationMode, project ?? undefined, mode, evidence);

      default: {
        const _exhaustive: never = strategy;
        return { content: [{ type: "text", text: `Unknown strategy: ${_exhaustive}` }], isError: true };
      }
    }
  }
);

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
