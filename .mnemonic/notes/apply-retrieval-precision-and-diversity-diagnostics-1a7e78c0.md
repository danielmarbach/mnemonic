---
title: 'Apply: Retrieval precision and diversity diagnostics'
tags:
  - workflow
  - apply
  - recall
  - diagnostics
  - cag-bench
lifecycle: temporary
createdAt: '2026-05-09T11:55:21.079Z'
updatedAt: '2026-05-09T11:55:32.654Z'
role: context
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: plan-retrieval-precision-and-diversity-diagnostics-51c5277c
    type: follows
memoryVersion: 1
---
## Apply: Retrieval Precision and Diversity Diagnostics

Implemented Steps 1-4 from plan `plan-retrieval-precision-and-diversity-diagnostics-51c5277c`.

### Changes

**src/structured-content.ts**:

- Added `RecallDiversity` interface: `themeCount`, `roleMix` (Partial<Record<NoteRole, number>>), `lifecycleMix` (Partial<Record<NoteLifecycle, number>>)
- Added `RecallRetrievalCoverage` interface: `anchorsInResults`, `highPriorityAnchorsTotal`, `fraction`, `missingAnchors`
- Extended `RecallResult` with `recallScopeNoteCount`, `diversity`, `retrievalCoverage` (all optional)
- Updated `RecallResultSchema` with corresponding Zod schemas

**src/tools/recall-helpers.ts**:

- `identifyHighPriorityAnchors(vaults, projectId)` — uses session cache (`getOrBuildVaultNoteList`), detects superseded notes from `relatedTo`, filters to `(alwaysLoad || role === "summary") && !superseded`
- `computeRecallDiversity(results)` — unique tag count across selected results, role/lifecycle counts
- `computeRecallRetrievalCoverage(resultIds, anchorIds, anchorLookup)` — fraction of anchors present, capped missing list with titles

**src/tools/recall.ts**:

- Vault-size-aware limit heuristic: `limit >= ctx.defaultRecallLimit` gates expansion; `noteCount <= 25` → dump all, otherwise use caller's limit
- Diversity and coverage computed after `structuredResults` built, before constructing final `RecallResult`
- Coverage skipped when no project context

### Design decisions

- Limit heuristic only expands the Zod-provided default (5), never overrides caller-explicit limit (e.g. `limit: 1`)
- Anchors use only frontmatter fields (`alwaysLoad`, `role`), no dynamic computation
- Superseded detection uses session cache with `continue` on vault failure (skip vault, not silently return empty set)
- Zod v4: `z.record(z.string(), z.number())` instead of `.partial()` on typed record (not supported in v4)

### Verification

- `npx tsc --noEmit`: clean
- `npm test`: 50 files, 845 tests, all passing
- Fix included for relationship-expansion test (explicit `limit: 1` respected)
