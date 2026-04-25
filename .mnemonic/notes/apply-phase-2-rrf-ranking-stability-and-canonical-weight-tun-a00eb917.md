---
title: 'Apply: Phase 2 RRF ranking stability and canonical weight tuning'
tags:
  - apply
  - workflow
  - recall
  - rrf
  - phase2
lifecycle: temporary
createdAt: '2026-04-25T06:36:45.984Z'
updatedAt: '2026-04-25T21:43:24.549Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: plan-phase-2-reciprocal-rank-fusion-implementation-c8a07d89
    type: follows
  - id: review-phase-2-rrf-double-check-regression-findings-8556a52f
    type: derives-from
  - id: review-phase-2-rrf-stability-verification-after-tie-rank-adj-1b3f9752
    type: derives-from
  - id: review-phase-2-rrf-commit-and-dogfooding-validation-complete-151ee91f
    type: derives-from
  - id: phase-2-rrf-ranking-completed-bb163f54
    type: supersedes
memoryVersion: 1
---
# Apply: Phase 2 RRF ranking stability and canonical weight tuning

## Scope

Continue Phase 2 RRF implementation and resolve active ranking regressions observed during double-check verification.

## Root cause investigation

1. Integration test mismatch persisted because integration tests execute `build/index.js`; local source edits were not reflected until rebuild.
2. RRF tie behavior over-penalized lexical reranking in tied-semantic scenarios due strict ordinal ranking.
3. Canonical explanation additive term could displace direct factual answers in non-explanatory queries when semantic vectors are tied.

## Code changes

### `src/recall.ts`

- Added dense rank assignment helper with epsilon tie handling (`assignDenseRanks`) for stable rank semantics.
- Semantic rank assignment now uses dense ranking by semantic `score` (not boosted-only ordering), preserving lexical tie-break opportunity for true semantic ties.
- Lexical rank assignment now uses combined lexical rank signal (`lexical + coverage*0.3 + phrase*0.5`) with dense ranking.
- Added deterministic hybrid comparator (`compareByHybridScore`) and reused it in:
  - `applyCanonicalExplanationPromotion`
  - `selectRecallResults`
  - `selectWorkflowResults` tie resolution path
- Reduced canonical additive impact in hybrid score via `CANONICAL_HYBRID_WEIGHT = 0.005` to keep canonical promotion as a nudge instead of overriding direct-answer ranking.

### `tests/recall.unit.test.ts`

Updated 3 outdated additive-hybrid tests to reflect RRF semantics:

- ranking test now provides explicit `semanticRank`/`lexicalRank`
- lexical-contribution test now validates RRF rank-based contribution
- canonical contribution test now validates small additive delta instead of old additive formula

## Verification run

- `npm run typecheck` ✅
- `npm test -- tests/recall.unit.test.ts` ✅
- `npm run build` ✅
- `npm test -- tests/recall-embeddings.integration.test.ts` ✅
- `npm test` ✅ (703/703)

## Outcome

Phase 2 RRF path now preserves expected ordering behavior for semantic ties, lexical reranking, canonical explanation nudging, and direct-answer precedence.
