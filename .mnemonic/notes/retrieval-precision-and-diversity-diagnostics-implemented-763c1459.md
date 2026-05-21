---
title: Retrieval precision and diversity diagnostics (implemented)
tags:
  - workflow
  - apply
  - recall
  - diagnostics
  - cag-bench
  - plan
lifecycle: permanent
createdAt: '2026-05-09T21:02:25.406Z'
updatedAt: '2026-05-09T21:03:51.512Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: implementation-principles-for-mnemonic-mcp-2e178bba
    type: related-to
  - id: summary-evidence-enrichment-implementation-across-recall-and-10b7ba37
    type: related-to
memoryVersion: 1
---
## Consolidated from:
### Apply: Retrieval precision and diversity diagnostics
*Source: `apply-retrieval-precision-and-diversity-diagnostics-1a7e78c0`*

## Apply: Retrieval Precision and Diversity Diagnostics

Implemented Steps 1-4 from plan `plan-retrieval-precision-and-diversity-diagnostics-51c5277c`.

### Changes

**src/structured-content.ts**:

- Added `RecallDiversity` interface: `themeCount`, `roleMix` (Partial\<Record\<NoteRole, number>>), `lifecycleMix` (Partial\<Record\<NoteLifecycle, number>>)
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

- **Schema descriptions added (post-review)**: Zod output schema fields `recallScopeNoteCount`, `diversity`, and `retrievalCoverage` now carry `.describe()` strings that appear in the MCP JSON schema. Tool description `Returns` section updated with three new bullet points explaining `recallScopeNoteCount` (omit-aware, vault-size heuristic signal), `diversity` (theme/role/lifecycle mix for perspective breadth), and `retrievalCoverage` (anchor coverage fraction + missing list for follow-up recall). Per the structured-content principle, both prose and schema descriptions are needed — weaker models rely on schema descriptions, stronger models benefit from the tool description context.

- **recallScopeNoteCount always populated for project contexts (post-review fix)**: The initial implementation gated `recallScopeNoteCount` computation inside the limit heuristic block (`limit >= ctx.defaultRecallLimit`), meaning agents passing explicit `limit: 1` got no scope note count to decide whether to tighten or loosen on subsequent calls. Fixed by moving the note count computation outside the limit expansion gate while keeping the expansion heuristic gated. Now `recallScopeNoteCount` is always available when project context exists, regardless of the caller's limit.

- **Integration tests added (post-review)**: `recall-pipeline.integration.test.ts` now covers project-context diagnostics (recallScopeNoteCount, diversity themeCount/lifecycleMix, retrievalCoverage anchors and fraction) and explicit `limit:1` still populating recallScopeNoteCount.

- **I/O constraint fix (post-review)**: Removed non-project `vault.storage.listNotes()` fallback in limit heuristic. The plan states: "For the non-project cold path, fall back to the configured default — don't add I/O just for this heuristic." The original implementation violated this by making direct I/O calls when no project context exists. Fixed by gating the entire heuristic block on `project` being defined, so no new I/O is introduced on the global-only path.

- **Unit tests added (post-review)**: New `tests/recall-helpers.unit.test.ts` with 11 tests covering `computeRecallDiversity` and `computeRecallRetrievalCoverage` helpers.

- Limit heuristic only expands the Zod-provided default (5), never overrides caller-explicit limit (e.g. `limit: 1`)

- Anchors use only frontmatter fields (`alwaysLoad`, `role`), no dynamic computation

- Superseded detection uses session cache with `continue` on vault failure (skip vault, not silently return empty set)

- Zod v4: `z.record(z.string(), z.number())` instead of `.partial()` on typed record (not supported in v4)

### Verification

- `npx tsc --noEmit`: clean
- `npm test`: 50 files, 845 tests, all passing
- Fix included for relationship-expansion test (explicit `limit: 1` respected)

### Plan: Retrieval precision and diversity diagnostics
*Source: `plan-retrieval-precision-and-diversity-diagnostics-51c5277c`*

## Plan: Retrieval Precision and Diversity Diagnostics

Deliver immediate actions 1-4 from CAG-Bench research. No new persistence, no new infrastructure. All additive, fail-soft.

### Step 1: recallScopeNoteCount in RecallResult schema

Add `recallScopeNoteCount?: number` to `RecallResult` interface in `src/structured-content.ts`. Total count of notes across all visible vaults for the recall scope. Already tracked during the recall pipeline — just expose it. Named to reflect multi-vault visibility, not single-vault assumption. Optional for backward compatibility.

### Step 2: Vault-size-aware default limit

In `src/tools/recall.ts` handler, before scoring, derive note count from the session cache (`noteList.length` on cached vault). The cache is already populated by `getOrBuildVaultEmbeddings` earlier in the pipeline for the project case. For the non-project (global) cold path, fall back to the configured default — don't add I/O just for this heuristic.

Single threshold, single source of evidence: the paper's cap=25 baseline works at 30 rows (the only store size it studied). No speculative tiers.

- noteCount <= 25: effective limit = Math.min(noteCount, 20) — dump everything, paper-justified
- noteCount > 25: effective limit = configured default (5) — agent uses `recallScopeNoteCount` from output to decide whether to tighten or loosen on subsequent calls

Reuses already-in-memory data. No new I/O or git calls. Fail-soft to configured default when cache is unavailable.

### Step 3: Diversity metrics in RecallResult

Add to `RecallResult` interface:

```typescript
diversity?: {
  themeCount: number;
  roleMix: Partial<Record<NoteRole, number>>;
  lifecycleMix: Partial<Record<NoteLifecycle, number>>;
}
```

`Partial` is correct — not all roles (`summary | decision | plan | context | reference`) or lifecycles (`temporary | permanent`) appear in every result set. A missing key means zero occurrences. Uses existing domain types from `src/storage.ts`.

`themeCount` is unique tag count across selected results. Tags are stable, cheap, language-independent, and frontmatter-backed. No classification reuse — defer richer theme derivation to later work.

Roles and lifecycles from note frontmatter (already cached). Compute after `selectRecallResults`. Fail-soft — omit the field on computation failure.

### Step 4: retrievalCoverage in RecallResult

Add to `RecallResult` interface:

```typescript
retrievalCoverage?: {
  anchorsInResults: number;
  highPriorityAnchorsTotal: number;
  fraction: number; // [0,1], defaults to 0 when highPriorityAnchorsTotal is 0
  missingAnchors: Array<{ id: string; title: string }>; // capped at 5
}
```

High-priority anchors: `(alwaysLoad === true || role === "summary") && !superseded`, scoped to current project vault. Excluding superseded notes prevents coverage pressure from including intentionally obsolete summaries. Frontmatter-only — no dynamic computation. O(1) per note from session cache.

Project scope essential: project-local anchors differ from global anchors, and some alwaysLoad notes are intentionally orthogonal to a query. Skip anchor coverage when no project context.

Compute after selection. Fail-soft — omit the field when cache unavailable or computation fails.

### Implementation notes

- Changes: `src/structured-content.ts` (types + Zod schemas), `src/tools/recall.ts` (handler), `src/tools/recall-helpers.ts` (anchor identification helper)
- No changes to `src/recall.ts` (scoring pipeline) — output-layer additions only
- All new fields optional in structured output for older consumers
- Derive Zod schemas from types using existing patterns in codebase; no separate schema definitions
- Test coverage: unit tests for limit heuristic, integration tests for recall result schema

### Verification

- `npm test -- tests/recall.unit.test.ts tests/recall-pipeline.integration.test.ts`
- `npx tsc --noEmit`
- Dogfood Pack A (core enrichment/orientation) to confirm no regression
- Manual recall with small vault test fixture to verify limit heuristic
