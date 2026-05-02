---
title: 'Research: index.ts dependency analysis for modular extraction'
tags:
  - workflow
  - research
  - refactoring
lifecycle: temporary
createdAt: '2026-05-02T06:07:32.434Z'
updatedAt: '2026-05-02T06:10:25.435Z'
role: research
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: request-split-index-ts-into-modular-structure-cf87b146
    type: derives-from
  - id: plan-split-index-ts-into-modular-structure-e1cd6944
    type: derives-from
memoryVersion: 1
---
## Research: index.ts Dependency Analysis for Modular Extraction

### File Stats

- 6664 lines, zero exports, monolithic entry point

### Module-Level Singletons (shared state)

- `vaultManager` - nearly every tool handler, helpers, consolidate helpers, startup
- `configStore` - remember, set/get project identity/policy, update, consolidate, resolveProject
- `config` - embedMissingNotes (reads reindexEmbedConcurrency)
- `server` - startup only (tool + prompt registration)
- `migrator` - list_migrations, execute_migration, startup
- `VAULT_PATH` - CLI blocks, startup
- `DEFAULT_RECALL_LIMIT`, `DEFAULT_MIN_SIMILARITY`, `PROJECT_SCOPE_BOOST`, `TEMPORAL_HISTORY_NOTE_LIMIT`, `TEMPORAL_HISTORY_COMMIT_LIMIT` - recall handler

### Most-Heavily-Reused Helpers (15+ call sites)

- `ensureBranchSynced` - 15+ tool handlers (nearly all)
- `resolveProject` - 8+ tool handlers
- `storageLabel` - 10+ tool handlers
- `formatCommitBody` - 7+ tool handlers
- `pushAfterMutation` - 7+ tool handlers
- `buildMutationRetryContract` - 8+ tool handlers
- `invalidateActiveProjectCache` - 7+ tool handlers
- `shouldBlockProtectedBranchCommit` - 5 tool handlers
- `collectVisibleNotes` - 5+ tool handlers
- `projectNotFoundResponse` - 8 tool handlers

### Proposed Decomposition (Dependency Injection via ServerContext)

**Core pattern**: Each module exports `registerXxxTools(server, ctx)` / `registerXxxPrompts(server, ctx)` functions receiving a `ServerContext` object instead of accessing module-level singletons.

#### New modules

1. `src/server-context.ts` - ServerContext type + factory
2. `src/helpers/index.ts` - slugify, makeId, projectParam, format helpers
3. `src/helpers/git-commit.ts` - extractSummary, formatCommitBody, shouldBlockProtectedBranchCommit
4. `src/helpers/embed.ts` - embedTextForNote, embedMissingNotes, backfillEmbeddingsAfterSync, removeStaleEmbeddings
5. `src/helpers/persistence.ts` - resolveDurability, buildMutationRetryContract, pushAfterMutation
6. `src/helpers/vault.ts` - storageLabel, collectVisibleNotes, moveNoteBetweenVaults, ROLE_LIFECYCLE_DEFAULTS
7. `src/helpers/project.ts` - resolveProject, toProjectRef, ensureBranchSynced
8. `src/cli/migrate.ts` - CLI migrate command
9. `src/cli/import-claude-memory.ts` - CLI import command
10. `src/tools/*.ts` - each tool handler as register function
11. `src/tools/recall-helpers.ts` - buildRecallCandidateContext, collectLexicalRescueCandidates
12. `src/tools/consolidate-helpers.ts` - detectDuplicates, findClusters, executeMerge etc.
13. `src/prompts.ts` - prompt registrations
14. `src/startup.ts` - warnAboutPendingMigrations, shutdown, connect
15. `src/index.ts` - Slim entry: parse CLI, create context, register all, start

### Extraction Strategy: 4 Phases

Phase 1: Create ServerContext + extract helpers (no tool changes)
Phase 2: Extract tool handlers (each as register function)
Phase 3: Extract CLI commands, prompts, startup
Phase 4: Slim down index.ts to pure wiring
