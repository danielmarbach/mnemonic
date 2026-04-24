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
updatedAt: '2026-04-24T23:09:30.970Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: hybrid-recall-design-and-implementation-0-20-0-0-23-0-350317a0
    type: related-to
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

Edit `src/recall.ts` to replace additive scoring with RRF.
