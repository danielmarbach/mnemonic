---
title: 'Plan: Split index.ts into modular structure'
tags:
  - workflow
  - plan
  - refactoring
lifecycle: temporary
createdAt: '2026-05-02T06:10:17.697Z'
updatedAt: '2026-05-02T12:23:14.908Z'
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

#### Batch 1: Helper modules — DONE ✅

- \[x] `src/tools/recall-helpers.ts` — buildRecallCandidateContext, collectLexicalRescueCandidates, DiscoverTagStat, tokenizeTagDiscoveryText, countTokenOverlap, escapeRegex, hasExactTagContextMatch
- \[x] `src/tools/consolidate-helpers.ts` — detectDuplicates, findClusters, suggestMerges, executeMerge, pruneSuperseded, MergeGroup, ClusterResult, SimilarityPair, ConsolidationCandidate, ConsolidateExecuteMergeEvidence
- \[x] Update index.ts call sites to import from new modules

index.ts down from 5819 → 4682 lines. Both committed.

#### Batch 2: Simple tool handlers — DONE ✅

- \[x] `src/tools/detect-project.ts`
- \[x] `src/tools/get-project-identity.ts`
- \[x] `src/tools/set-project-identity.ts`
- \[x] `src/tools/migration.ts` (list\_migrations + execute\_migration)
- \[x] `src/tools/policy.ts` (set/get\_project\_memory\_policy)

index.ts down from 4682 → 4012 lines. Committed.

- \[ ] `src/tools/detect-project.ts`
- \[ ] `src/tools/get-project-identity.ts`
- \[ ] `src/tools/set-project-identity.ts`
- \[ ] `src/tools/migration.ts` (list\_migrations + execute\_migration)
- \[ ] `src/tools/policy.ts` (set/get\_project\_memory\_policy)

#### Batch 3: Core tool handlers — DONE ✅

- [x] `src/tools/remember.ts`
- [x] `src/tools/recall.ts`
- [x] `src/tools/update.ts`

index.ts down from ~4012 → ~2970 lines. Committed.

#### Batch 4: CRUD tool handlers

- \[ ] `src/tools/forget.ts`
- \[ ] `src/tools/get.ts`
- \[ ] `src/tools/where-is-memory.ts`
- \[ ] `src/tools/list.ts`
- \[ ] `src/tools/discover-tags.ts`

#### Batch 5: Query + mutation tool handlers

- \[ ] `src/tools/recent-memories.ts`
- \[ ] `src/tools/memory-graph.ts`
- \[ ] `src/tools/project-memory-summary.ts`
- \[ ] `src/tools/sync.ts`
- \[ ] `src/tools/move-memory.ts`
- \[ ] `src/tools/relate.ts`
- \[ ] `src/tools/unrelate.ts`
- \[ ] `src/tools/consolidate.ts`

#### Batch 6: Wire index.ts

- \[ ] Replace all inline tool registrations with registerXxxTool(server, ctx) calls
- \[ ] Remove unused imports from index.ts
- \[ ] Verify tsc and tests

### Phase 3: Extract CLI Commands, Prompts, Startup

- \[ ] Move CLI migrate command to `src/cli/migrate.ts`
- \[ ] Move CLI import-claude-memory command to `src/cli/import-claude-memory.ts`
- \[ ] Move prompt registrations to `src/prompts.ts`
- \[ ] Move `warnAboutPendingMigrationsOnStartup` and startup logic to `src/startup.ts`
- \[ ] Verify: `tsc --noEmit` passes, all tests pass

### Phase 4: Slim index.ts to Pure Wiring

- \[ ] Reduce `index.ts` to: imports, ServerContext creation, tool registration calls, server start
- \[ ] Target: ~100-150 lines
- \[ ] Verify: `tsc --noEmit` passes, all tests pass
- \[ ] Final review of module boundaries and naming
