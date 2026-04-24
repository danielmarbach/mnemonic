---
title: 'Review: Phase 1 Graph Spreading — Finding 1 Fix'
tags:
  - review
  - graph-spreading
  - recall
lifecycle: temporary
createdAt: '2026-04-24T22:37:44.392Z'
updatedAt: '2026-04-24T22:37:58.170Z'
role: review
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: apply-fix-finding-1-boost-existing-candidates-via-graph-spre-51fad28b
    type: derives-from
memoryVersion: 1
---
# Review: Phase 1 Graph Spreading — Finding 1 Fix

## What changed

Fixed the guard in `applyGraphSpreadingActivation` that was skipping existing candidates instead of boosting them.

### Before

```typescript
if (existingIds.has(rel.id) && !discovered.has(rel.id)) continue;
```

This made the implementation discovery-only — graph relationships could only add net-new candidates.

### After

- Build `candidateMap` for O(1) existing candidate lookup
- If candidate exists: add `propagatedScore` to `score`, `boosted`, and `semanticScoreForPromotion`
- If new: create discovered entry as before
- Discovered notes still accumulate from multiple entry points

### src/recall.ts diff summary

Lines 280-323 restructured: removed the early continue for existing IDs, replaced with in-place score boost.

## Verification

- All 703 tests pass (was 692 before the fix — +11 tests)
- New test: "boosts an existing candidate instead of skipping it"
- New test: "accumulates propagated scores onto an existing candidate from multiple entry points"
- Both tests verify `score`, `boosted`, and `semanticScoreForPromotion` are updated
- Typecheck passes
- No regression on full test suite

## Plan alignment

Finding 1 from review addressed in full. Finding 2 (metadata-starved discovered notes) and Finding 3 (cross-vault `isCurrentProject` heuristic) remain earmarked for Phase 2.

## Recommendation

Continue. Phase 1 implementation is now complete with true spreading activation behavior.
