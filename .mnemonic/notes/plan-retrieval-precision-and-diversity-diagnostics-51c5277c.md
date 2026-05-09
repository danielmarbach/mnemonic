---
title: 'Plan: Retrieval precision and diversity diagnostics'
tags:
  - workflow
  - plan
  - recall
  - diagnostics
  - cag-bench
lifecycle: temporary
createdAt: '2026-05-09T07:50:29.361Z'
updatedAt: '2026-05-09T07:58:56.101Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: research-cag-bench-paper-analysis-gaps-and-applications-for--8dbf8467
    type: derives-from
memoryVersion: 1
---
## Plan: Retrieval Precision and Diversity Diagnostics

Deliver immediate actions 1-4 from CAG-Bench research. No new persistence, no new infrastructure. All additive, fail-soft.

### Step 1: recallScopeNoteCount in RecallResult schema

Add `recallScopeNoteCount?: number` to `RecallResult` interface in `src/structured-content.ts`. Total count of notes across all visible vaults for the recall scope. Already tracked during the recall pipeline — just expose it. Named to reflect multi-vault visibility, not single-vault assumption. Optional for backward compatibility.

### Step 2: Vault-size-aware default limit

In `src/tools/recall.ts` handler, before scoring, derive note count from the session cache (`noteList.length` on cached vault). The cache is already populated by `getOrBuildVaultEmbeddings` earlier in the pipeline for the project case. For the non-project (global) cold path, fall back to the configured default — don't add I/O just for this heuristic.

Conservative heuristic to avoid accidental context dumping:

- noteCount <= 12: effective limit = noteCount
- noteCount < 30: effective limit = Math.min(10, noteCount)
- noteCount >= 30: effective limit = configured default (5)

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
