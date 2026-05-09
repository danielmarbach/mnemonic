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
updatedAt: '2026-05-09T07:50:58.287Z'
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

Add `vaultSize: number` to `RecallResult` interface in `src/structured-content.ts`. This is the total count of notes across all visible vaults for the recall scope. Already tracked during the recall pipeline — just expose it.

### Step 2: Vault-size-aware default limit

In `src/tools/recall.ts` handler, before scoring, count total visible notes. Apply heuristic:

- vaultSize < 30: effective limit = Math.min(vaultSize, 20)
- vaultSize 30-100: effective limit = configured default (5)
- vaultSize > 100: effective limit = configured default (5), surface hint in output

This is a parameter adjustment only. Does not change the scoring pipeline.

### Step 3: Diversity metrics in RecallResult

Add to `RecallResult` interface:

```typescript
diversity: {
  themeCount: number;
  roleMix: Record<string, number>;
  lifecycleMix: Record<string, number>;
}
```

After `selectRecallResults` in the tool handler, compute these from the selected result set. Themes derivable from note tags and content classification used in `project_memory_summary`. Roles and lifecycles already in note frontmatter.

### Step 4: retrievalCoverage in RecallResult

Add to `RecallResult` interface:

```typescript
retrievalCoverage: {
  anchorsInResults: number;
  highPriorityAnchorsTotal: number;
  fraction: number;
  missingAnchors: string[]; // ids of anchors NOT in results, capped at 5
}
```

High-priority anchors are notes with: `alwaysLoad === true` OR `role === "summary"` OR `confidence === "high"` AND `lifecycle === "permanent"` AND `project === currentProject`. Filter to current project scope since project-local anchors matter more than global anchors.

Compute after selection. Fail-soft — if anchor identification fails, omit the field.

### Implementation notes

- All changes touch `src/structured-content.ts` (types) and `src/tools/recall.ts` (handler)
- `src/tools/recall-helpers.ts` may need helpers for theme counting and anchor identification
- No changes to `src/recall.ts` (scoring pipeline) — these are output-layer additions
- All new fields are optional in structured output types for older consumers
- Test coverage: unit tests for vault-size heuristic, integration tests for recall result schema

### Verification

- `npm test -- tests/recall.unit.test.ts tests/recall-pipeline.integration.test.ts`
- `npx tsc --noEmit`
- Dogfood Pack A (core enrichment/orientation) to confirm no regression
- Manual recall with small vault test fixture to verify vault-size heuristic
