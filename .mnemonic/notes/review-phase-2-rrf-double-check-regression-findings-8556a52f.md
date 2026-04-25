---
title: 'Review: Phase 2 RRF double-check regression findings'
tags:
  - workflow
  - review
  - recall
  - rrf
  - phase2
lifecycle: temporary
createdAt: '2026-04-25T06:30:54.111Z'
updatedAt: '2026-04-25T06:30:57.870Z'
role: review
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: plan-phase-2-reciprocal-rank-fusion-implementation-c8a07d89
    type: derives-from
memoryVersion: 1
---
# Review: Phase 2 RRF double-check regression findings

## Scope

Re-ran verification for active Phase 2 RRF implementation status in `src/recall.ts` / `src/index.ts` and targeted recall test suites.

## Verification results

- `npm run typecheck` passes.
- `npm test -- tests/recall.unit.test.ts` fails with 3 outdated additive-hybrid assertions.
- `npm test -- tests/recall-embeddings.integration.test.ts` fails with 3 ranking expectation mismatches under current RRF behavior.

### Unit test failures

1. `selectRecallResults > uses hybrid score for ordering when lexical scores are present`
2. `computeHybridScore > adds lexical contribution when present`
3. `computeHybridScore > includes coverage, phrase, and canonical explanation contributions`

### Integration test failures

1. `keeps semantic paraphrase matches ahead when lexical overlap is weak`
2. `reranks semantic ties using projections even when no projection cache is warm`
3. `does not displace a direct answer with a generic overview note`

## Findings

- RRF-based scoring implementation is active, but tests still encode additive hybrid assumptions in several places.
- Behavior-level integration expectations now diverge in three scenarios; these need an explicit decision:
  - update assertions to new RRF semantics, or
  - adjust scoring/tiebreak logic to preserve previous ordering guarantees.

## Immediate next action

Decide expected ranking semantics for the three failing integration scenarios, then update either scoring logic or test expectations accordingly before full-suite verification.
