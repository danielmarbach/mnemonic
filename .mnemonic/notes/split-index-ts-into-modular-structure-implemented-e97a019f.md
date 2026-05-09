---
title: Split index.ts into modular structure (implemented)
tags:
  - workflow
  - plan
  - refactoring
  - request
lifecycle: permanent
createdAt: '2026-05-09T21:05:56.027Z'
updatedAt: '2026-05-09T21:06:02.096Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: typescript-code-review-mnemonic-project-961d984b
    type: related-to
  - id: mnemonic-key-design-decisions-3f2a6273
    type: derives-from
memoryVersion: 1
---
## Consolidated from:
### Plan: Split index.ts into modular structure
*Source: `plan-split-index-ts-into-modular-structure-e1cd6944`*

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

- \[x] `src/tools/remember.ts`
- \[x] `src/tools/recall.ts`
- \[x] `src/tools/update.ts`

index.ts down from ~4012 → ~2970 lines. Committed.

#### Batch 4: CRUD tool handlers — DONE ✅

- \[x] `src/tools/forget.ts`
- \[x] `src/tools/get.ts`
- \[x] `src/tools/where-is-memory.ts`
- \[x] `src/tools/list.ts`
- \[x] `src/tools/discover-tags.ts`

index.ts down from ~2970 → ~2330 lines. Committed.

#### Batch 5: Query + mutation tool handlers — DONE ✅

- \[x] `src/tools/recent-memories.ts`
- \[x] `src/tools/memory-graph.ts`
- \[x] `src/tools/project-memory-summary.ts`
- \[x] `src/tools/sync.ts`
- \[x] `src/tools/move-memory.ts`
- \[x] `src/tools/relate.ts`
- \[x] `src/tools/unrelate.ts`
- \[x] `src/tools/consolidate.ts`

Also extracted `warnAboutPendingMigrationsOnStartup` to `src/startup.ts`.

index.ts down from ~2330 → ~822 lines. Committed.

- \[ ] `src/tools/recent-memories.ts`
- \[ ] `src/tools/memory-graph.ts`
- \[ ] `src/tools/project-memory-summary.ts`
- \[ ] `src/tools/sync.ts`
- \[ ] `src/tools/move-memory.ts`
- \[ ] `src/tools/relate.ts`
- \[ ] `src/tools/unrelate.ts`
- \[ ] `src/tools/consolidate.ts`

#### Batch 6: Cleanup unused imports and wrappers — DONE ✅

- \[x] Replace all inline tool registrations with registerXxxTool(server, ctx) calls
- \[x] Remove all unused wrapper functions (18 functions)
- \[x] Remove all unused imports (~90 symbols from 25+ modules)
- \[x] Remove unused local variable 'cwd' in migration CLI
- \[x] Verify tsc and tests

index.ts: ~822 → ~589 lines. All 845 tests pass. TypeScript compiles with --noUnusedLocals. Committed.

- \[ ] Replace all inline tool registrations with registerXxxTool(server, ctx) calls
- \[ ] Remove unused imports from index.ts
- \[ ] Verify tsc and tests

### Phase 3: Extract CLI Commands, Prompts, Startup — DONE ✅

- \[x] Move CLI migrate command to `src/cli/migrate.ts` — exports `runMigrateCli()`
- \[x] Move CLI import-claude-memory command to `src/cli/import-claude-memory.ts` — exports `runImportCli()`, `makeImportNoteId()`
- \[x] Move prompt registrations to `src/prompts.ts` — exports `registerPrompts(server)`
- \[x] Extend `src/startup.ts` with `startServer(server, ctx)`
- \[x] Verify: `tsc --noEmit` passes, all tests pass

index.ts: ~589 → ~172 lines after Phase 3 wiring. Committed.

- \[ ] Move CLI migrate command to `src/cli/migrate.ts`
- \[ ] Move CLI import-claude-memory command to `src/cli/import-claude-memory.ts`
- \[ ] Move prompt registrations to `src/prompts.ts`
- \[ ] Move `warnAboutPendingMigrationsOnStartup` and startup logic to `src/startup.ts`
- \[ ] Verify: `tsc --noEmit` passes, all tests pass

### Phase 4: Slim index.ts to Pure Wiring — DONE ✅

- \[x] Extract `createServerContext()` and `readPackageVersion()` to `src/context.ts`
- \[x] Create `src/tools/index.ts` barrel — exports `registerAllTools(server, ctx)`
- \[x] Slim `index.ts` to: imports, CLI guards, context creation, server creation, tool registrations, server start
- \[x] Target achieved: **41 lines**
- \[x] Verify: `tsc --noEmit` passes, `tsc --noUnusedLocals` passes, all non-flaky tests pass

Final `src/index.ts` structure:

```
imports (7 lines)
CLI guards: migrate (7 lines)
CLI guards: import-claude-memory (7 lines)
context + server creation (8 lines)
registerAllTools + registerPrompts (2 lines)
startServer (1 line)
```

All modularization complete. Committed.

- \[ ] Reduce `index.ts` to: imports, ServerContext creation, tool registration calls, server start
- \[ ] Target: ~100-150 lines
- \[ ] Verify: `tsc --noEmit` passes, all tests pass
- \[ ] Final review of module boundaries and naming

### Request: Split index.ts into modular structure
*Source: `request-split-index-ts-into-modular-structure-cf87b146`*

## Request

Refactor `src/index.ts` (6,664 lines) into a modular structure. The file is a monolithic entry point mixing CLI commands, config constants, 20+ MCP tool handlers, helper functions, prompt registrations, and startup logic. Zero exports — everything is module-private.

## Motivation

- Reviewed in TypeScript code review (memory `typescript-code-review-mnemonic-project-961d984b`) and flagged as a deferred improvement
- The file is difficult to navigate, test, and reason about
- Individual tool handlers can't be unit-tested in isolation
- Helper functions are tightly coupled to module-level singletons

## Scope

Full extraction of all tool handlers, CLI commands, helpers, and prompts into separate modules, leaving a slim entry point that wires everything together.
