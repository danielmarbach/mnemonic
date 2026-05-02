---
title: 'Plan: Split index.ts into modular structure'
tags:
  - workflow
  - plan
  - refactoring
lifecycle: temporary
createdAt: '2026-05-02T06:10:17.697Z'
updatedAt: '2026-05-02T08:02:50.337Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: research-index-ts-dependency-analysis-for-modular-extraction-07f545d4
    type: derives-from
  - id: request-split-index-ts-into-modular-structure-cf87b146
    type: follows
memoryVersion: 1
---
## Plan: Split index.ts into Modular Structure

Phase 1: ServerContext + Extract Helpers — DONE (845 lines extracted, 6 new modules, index.ts down to 5819 lines, committed)

### Phase 2: Extract Tool Handlers — IN PROGRESS

Batch approach due to subagent size limits. Each batch must pass tsc and tests before proceeding.

#### Batch 1: Helper modules

- [ ] `src/tools/recall-helpers.ts` — buildRecallCandidateContext, collectLexicalRescueCandidates, DiscoverTagStat, tokenize helpers
- [ ] `src/tools/consolidate-helpers.ts` — detectDuplicates, findClusters, suggestMerges, executeMerge, etc.
- [ ] Update index.ts call sites to import from new modules

#### Batch 2: Simple tool handlers

- [ ] `src/tools/detect-project.ts`
- [ ] `src/tools/get-project-identity.ts`
- [ ] `src/tools/set-project-identity.ts`
- [ ] `src/tools/migration.ts` (list_migrations + execute_migration)
- [ ] `src/tools/policy.ts` (set/get_project_memory_policy)

#### Batch 3: Core tool handlers

- [ ] `src/tools/remember.ts`
- [ ] `src/tools/recall.ts`
- [ ] `src/tools/update.ts`

#### Batch 4: CRUD tool handlers

- [ ] `src/tools/forget.ts`
- [ ] `src/tools/get.ts`
- [ ] `src/tools/where-is-memory.ts`
- [ ] `src/tools/list.ts`
- [ ] `src/tools/discover-tags.ts`

#### Batch 5: Query + mutation tool handlers

- [ ] `src/tools/recent-memories.ts`
- [ ] `src/tools/memory-graph.ts`
- [ ] `src/tools/project-memory-summary.ts`
- [ ] `src/tools/sync.ts`
- [ ] `src/tools/move-memory.ts`
- [ ] `src/tools/relate.ts`
- [ ] `src/tools/unrelate.ts`
- [ ] `src/tools/consolidate.ts`

#### Batch 6: Wire index.ts

- [ ] Replace all inline tool registrations with registerXxxTool(server, ctx) calls
- [ ] Remove unused imports from index.ts
- [ ] Verify tsc and tests

### Phase 3: Extract CLI Commands, Prompts, Startup

- [ ] Move CLI migrate command to `src/cli/migrate.ts`
- [ ] Move CLI import-claude-memory command to `src/cli/import-claude-memory.ts`
- [ ] Move prompt registrations to `src/prompts.ts`
- [ ] Move `warnAboutPendingMigrationsOnStartup` and startup logic to `src/startup.ts`
- [ ] Verify: `tsc --noEmit` passes, all tests pass

### Phase 4: Slim index.ts to Pure Wiring

- [ ] Reduce `index.ts` to: imports, ServerContext creation, tool registration calls, server start
- [ ] Target: ~100-150 lines
- [ ] Verify: `tsc --noEmit` passes, all tests pass
- [ ] Final review of module boundaries and naming
