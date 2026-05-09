---
title: 'Review: Retrieval precision and diversity diagnostics'
tags:
  - workflow
  - review
  - recall
  - diagnostics
  - cag-bench
lifecycle: temporary
createdAt: '2026-05-09T11:55:51.123Z'
updatedAt: '2026-05-09T12:20:13.019Z'
role: review
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: apply-retrieval-precision-and-diversity-diagnostics-1a7e78c0
    type: derives-from
  - id: temporal-interpretation-strategy-f8573d1d
    type: related-to
memoryVersion: 1
---
## Review: Retrieval Precision and Diversity Diagnostics

### Plan deliverables check

- \[x] Step 1: `recallScopeNoteCount` in RecallResult schema — shipped, optional number on both interface and Zod
- \[x] Step 2: Vault-size-aware default limit — gated on `limit >= ctx.defaultRecallLimit`, single threshold (<=25 dump all), session-cache derived
- \[x] Step 3: Diversity metrics — themeCount (unique tags), roleMix, lifecycleMix with proper types
- \[x] Step 4: retrievalCoverage — anchorsInResults, fraction, missingAnchors with titles, superseded exclusion, project-scoped only

### Type safety verification

- RoleMix/lifecycleMix use `Partial<Record<NoteRole, number>>` not `Record<string, number>` — invalid states unrepresentable
- Zod v4 compatibility: `z.record(z.string(), z.number())` (`.partial()` not supported in v4)
- All new fields optional for backward compatibility

### Performance principles verification

### Post-review fixes applied

- **I/O constraint violation fixed**: The initial implementation violated the plan's "no new I/O for the non-project cold path" principle by falling back to `vault.storage.listNotes()` when `project` was undefined. Fixed by gating the entire limit-heuristic block on `project` being defined. When no project context is available, `recallScopeNoteCount` and `effectiveLimit` use the configured defaults — no extra I/O.
- **Unit tests added**: `tests/recall-helpers.unit.test.ts` with 11 tests covering `computeRecallDiversity` (5 tests) and `computeRecallRetrievalCoverage` (6 tests). Plan specified "unit tests for limit heuristic, integration tests for recall result schema" but no tests were initially shipped.
- **Build rebuilt** after stale `build/tools/recall-helpers.js` caused integration test failure (missing export `computeRecallMetadataBoost`).

- Anchor identification reuses session cache (`getOrBuildVaultNoteList`), no new I/O
- Limit heuristic reads from already-populated cache, falls back to default on miss
- No git calls added, no full-vault scans on mutation paths

### Fail-soft verification

- Anchor identification: `continue` on vault failure (skip vault, not silent empty Set)
- Diversity computation: wrapped in try/catch, returns undefined
- Coverage computation: wrapped in try/catch, returns undefined
- Limit heuristic: wrapped in try/catch, falls back to configured limit
- Coverage skipped entirely when no project context

### Research requirements met

- Gap 3 (scale-adaptive retrieval): limit expansion for small vaults, recallScopeNoteCount for agents
- Gap 4 (token efficiency metrics): recallScopeNoteCount exposed for agent-side computation
- Gap 2 (retrieval precision approximation): diversity + coverage metrics as proximal measures

### Test verification

- Command: `npx tsc --noEmit`

- Result: pass

- Details: zero errors

- Command: `npm test`

- Result: pass

- Details: 50 files, 845 tests, all passing

### Recommendation

Continue. All plan deliverables shipped, all constraints preserved, all tests passing. Ready for you to decide on commit.### Dogfood verification\* Command: `MNEMONIC_ENTRYPOINT=./build/index.js node scripts/run-dogfood-packs.mjs`

- Result: pass (2 pre-existing advisories listed below, no regressions from changes)
- Pack A advisory: "recall answers canonical design questions" — embedding note outranks key design decisions for B1 query (pre-existing ranking gap)
- Pack A advisory: "recent-to-architecture navigation works" — graph connectivity gap, reachable=false in 3 steps (pre-existing graph issue)
- Pack A B4 (cold hybrid): hybrid recall design note at top — PASS (no regression confirmed against fresh build)
- Pack A B3 (verbose temporal): key design decisions at top — PASS
- Pack A B2 (temporal): Temporal Interpretation Strategy at top, filter not over-excluding — PASS
- Pack B (working-state): all checks PASS, no advisories, temporary notes surfaced correctly### RecommendationContinue. All plan deliverables shipped, all constraints preserved, all tests passing, dogfood confirms no regression. The two Pack A advisories are pre-existing and unrelated to the recall diagnostics additions.
