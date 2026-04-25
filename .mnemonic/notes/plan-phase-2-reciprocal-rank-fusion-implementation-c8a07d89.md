---
title: 'Plan: Phase 2 Reciprocal Rank Fusion Implementation'
tags:
  - workflow
  - plan
  - recall
  - rrf
  - phase2
lifecycle: temporary
createdAt: '2026-04-24T23:09:30.970Z'
updatedAt: '2026-04-25T06:37:09.857Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: hybrid-recall-design-and-implementation-0-20-0-0-23-0-350317a0
    type: related-to
  - id: request-phase-2-reciprocal-rank-fusion-in-recall-ee43a37e
    type: derives-from
  - id: review-phase-2-rrf-double-check-regression-findings-8556a52f
    type: derives-from
  - id: apply-phase-2-rrf-ranking-stability-and-canonical-weight-tun-a00eb917
    type: follows
  - id: review-phase-2-rrf-stability-verification-after-tie-rank-adj-1b3f9752
    type: derives-from
memoryVersion: 1
---
# Plan: Phase 2 Reciprocal Rank Fusion Implementation

## Research source

- plan-mnemonic-recall-improvements-from-hindsight-research-5b059160
- hybrid-recall-design-and-implementation-0-20-0-0-23-0-350317a0

## Phase 2 decisions

- RRF constant: `RRF_K = 60`
- Option A for project boost: no additional post-RRF additive term (project-boosted semantic ranks already carry priority into the semanticRank)
- Preserve discoverability of canonical explanation promotion via `semanticScoreForPromotion` gating

## Status (2026-04-25)

Implementation in progress. RRF formula with `boosted` backbone + scaled contributions works but test expectations need updating.

### Design iteration

Initial RRF implementation dropped `boosted` entirely, causing ranking failures. Corrected to:

```typescript
hybrid = boosted + (1/(K + semanticRank) + 1/(K + lexicalRank)) * 3.5 + canonicalExplanationScore
```

- `boosted` remains the semantic backbone (rawScore + project boost + metadata boost)
- RRF replaces only the old additive lexical/coverage/phrase small weights
- Scaling factor 3.5 chosen so max RRF ≈ 0.115, matching old additive contributions
- Fallback: if semanticRank missing, returns boosted + canonical (backward-compatible)

### Implementation changes made

- `src/recall.ts`:
  - Added `RRF_K = 60`
  - `ScoredRecallCandidate` gains `semanticRank` and `lexicalRank`
  - `computeHybridScore` uses RRF with scaled contributions
  - `applyLexicalReranking` assigns `semanticRank` during its pass
  - `applyCanonicalExplanationPromotion` assigns `lexicalRank` then sorts by RRF
- `src/index.ts`:
  - `collectLexicalRescueCandidates` sorts by lexicalScore instead of computeHybridScore

### Remaining work

1. ✅ `src/recall.ts` — RRF scoring implemented
2. ✅ `src/index.ts` — rescue candidate sort updated
3. 🔧 `tests/recall.unit.test.ts` — 4 unit tests failing (expected, test expectations need updating for RRF)
4. 🔧 `tests/recall-embeddings.integration.test.ts` — 3 integration tests failing (lexical strength expectations)
5. ⏳ Run verification after test fixes
6. ⏳ Dogfooding validation
7. ⏳ Review note

### Notes

- The `semanticScoreForPromotion` gating for canonical explanation promotion remains unchanged
- `computeWorkflowScore` still adds role/temporary/centrality boosts on top of `computeHybridScore`
- Fail-soft behavior preserved: no ranks → fallback to boosted + canonical
- Language independence unaffected (no English wording tuning)

## Tasks

### 1) Modify `src/recall.ts`

- Remove `LEXICAL_HYBRID_WEIGHT`, `COVERAGE_HYBRID_WEIGHT`, `PHRASE_HYBRID_WEIGHT` constants
- Add `RRF_K = 60`
- `ScoredRecallCandidate` gains `semanticRank` and `lexicalRank` fields
- Compute `RRFScore` and store on candidate
- Update `computeHybridScore` to return RRF-based score
- Update `applyLexicalReranking` to assign both semantic and lexical ranks
- Update `applyCanonicalExplanationPromotion` to sort by RRF score + canonical

### 2) Modify `src/index.ts`

- No handler changes needed if recall functions are updated
- Rescue and graph spreading pipelines still feed into `computeHybridScore`

### 3) Update `tests/recall.unit.test.ts`

- Update `computeHybridScore` tests for RRF semantics
- Update `applyLexicalReranking` tests for rank fields
- Update `selectRecallResults` tests for expected ordering under RRF

### 4) Verification

```bash
npm run typecheck
npm test
```

Expected: all existing tests pass or are updated to reflect RRF behavior.

## Validation strategy

- RRF with strong in both channels > RRF with strong in one channel only
- RRF with only semantic channel (missing lexical) still produces valid ranking
- Tiebreakers preserve current behavior (project preference, metadata boosts)

## Risk controls

- Fail-soft: if `lexicalRank` undefined, semantic-only RRF still works
- Reversible: additive weights can be restored if RRF underperforms
- No new storage or committed artifacts

## Immediate next action

Update tests to reflect RRF semantics, then run verification.
