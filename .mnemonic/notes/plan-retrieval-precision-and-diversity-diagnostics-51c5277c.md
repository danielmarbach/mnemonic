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
updatedAt: '2026-05-09T07:55:41.857Z'
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

### Step 1: vaultSize in RecallResult schema

Add `vaultSize?: number` to `RecallResult` interface in `src/structured-content.ts`. Total count of notes across all visible vaults for the recall scope. Already tracked during the recall pipeline — just expose it. Optional for backward compatibility.

### Step 2: Vault-size-aware default limit

In `src/tools/recall.ts` handler, before scoring, derive vault size from the session cache (`noteList.length` on cached vault). The cache is already populated by `getOrBuildVaultEmbeddings` earlier in the pipeline for the project case. For the non-project (global) cold path, fall back to the configured default — don't add I/O just for this heuristic.

Apply heuristic:

- vaultSize < 30: effective limit = Math.min(vaultSize, 20)
- vaultSize 30-100: effective limit = configured default (5)
- vaultSize > 100: effective limit = configured default (5), surface vaultSize hint in output

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

`Partial` is correct — not all roles (`summary | decision | plan | context | reference`) or lifecycles (`temporary | permanent`) appear in every result set. A missing key means zero occurrences. This makes invalid role/lifecycle keys unrepresentable, matching existing domain types in `src/storage.ts`.

Themes derivable from note tags and content classification used in `project_memory_summary`. Roles and lifecycles from note frontmatter (already cached). Compute these from the selected result set after `selectRecallResults`. Fail-soft — omit the field on computation failure.

### Step 4: retrievalCoverage in RecallResult

Add to `RecallResult` interface:

```typescript
retrievalCoverage?: {
  anchorsInResults: number;
  highPriorityAnchorsTotal: number;
  fraction: number; // [0,1], defaults to 0 when highPriorityAnchorsTotal is 0
  missingAnchors: string[]; // ids of anchors NOT in results, capped at 5
}
```

High-priority anchors: `alwaysLoad === true` OR `role === "summary"`, scoped to current project vault. Frontmatter-only — no dynamic computation. O(1) per note from session cache (`noteList` in memory from `getOrBuildVaultEmbeddings`).

Project scope essential: project-local anchors differ from global anchors, and some alwaysLoad notes are intentionally orthogonal to a query. Skip anchor coverage when no project context.

Compute after selection. Fail-soft — omit the field when cache unavailable or computation fails.

### Implementation notes

- Changes: `src/structured-content.ts` (types + Zod schemas), `src/tools/recall.ts` (handler), `src/tools/recall-helpers.ts` (theme/anchor helpers)
- No changes to `src/recall.ts` (scoring pipeline) — output-layer additions only
- All new fields optional in structured output for older consumers
- Derive Zod schemas from types using existing patterns in codebase; no separate schema definitions
- Test coverage: unit tests for vault-size heuristic, integration tests for recall result schema

### Verification

- `npm test -- tests/recall.unit.test.ts tests/recall-pipeline.integration.test.ts`
- `npx tsc --noEmit`
- Dogfood Pack A (core enrichment/orientation) to confirm no regression
- Manual recall with small vault test fixture to verify vault-size heuristic
