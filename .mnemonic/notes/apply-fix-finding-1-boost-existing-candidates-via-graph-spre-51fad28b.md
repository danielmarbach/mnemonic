---
title: 'Apply: Fix Finding 1 — boost existing candidates via graph spreading'
tags:
  - apply
  - graph-spreading
  - recall
lifecycle: temporary
createdAt: '2026-04-24T22:35:11.748Z'
updatedAt: '2026-04-24T22:37:58.170Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
# Apply: Fix Finding 1 — boost existing candidates via graph spreading

## Task

Fix the graph spreading activation guard so existing candidates receive score accumulation instead of being skipped.

## Context

The review of Phase 1 Graph Spreading Activation (id: review-phase-1-graph-spreading-activation-08de3943) identified that line src/recall.ts:288 skips notes already in the candidate set entirely:

```typescript
if (existingIds.has(rel.id) && !discovered.has(rel.id)) continue;
```

This makes the implementation discovery-only. Classic spreading activation propagates to ALL connected nodes, boosting already-surfaced notes.

## Changes

**`src/recall.ts`:**

- Remove the skip guard for existing candidates
- Build a `candidateMap` (id -> candidate) for O(1) lookup
- For existing candidates: add `propagatedScore` to `score`, `boosted`, and `semanticScoreForPromotion`
- For new discoveries: keep existing `discovered` map creation/accumulation logic
- Return candidates directly (no change to return shape)

**`tests/recall.unit.test.ts`:**

- Add test: existing candidate receives score boost from related entry point
- Add test: multiple entry points accumulate onto same existing candidate

## Validation

- All tests pass
- Typecheck passes
- New test specifically verifies existing candidate score boost behavior
