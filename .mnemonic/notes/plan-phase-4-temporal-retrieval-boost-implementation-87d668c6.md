---
title: 'Plan: Phase 4 temporal retrieval boost implementation'
tags:
  - workflow
  - plan
  - phase4
  - recall
  - temporal
lifecycle: temporary
createdAt: '2026-04-25T10:47:53.383Z'
updatedAt: '2026-04-25T10:48:01.532Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: request-phase-4-temporal-retrieval-boost-in-recall-57cb8663
    type: derives-from
  - id: plan-mnemonic-recall-improvements-from-hindsight-research-5b059160
    type: follows
memoryVersion: 1
---
# Plan: Phase 4 temporal retrieval boost implementation

## Source

- plan-mnemonic-recall-improvements-from-hindsight-research-5b059160

## Design

1. Add temporal query hint detection in recall scoring module.
2. Add bounded recency boost function that decays linearly inside a time window and returns zero outside.
3. Apply temporal boost to semantic candidates during recall scoring.
4. Apply the same temporal boost to lexical-rescue candidates so rescue behavior stays consistent.
5. Add unit tests for detection and boost behavior.
6. Run verification and produce apply/review artifacts.

## Constraints

- Boost-only in this phase (no strict date filtering).
- Keep behavior additive, bounded, and reversible.
- Preserve fail-soft behavior for missing/invalid dates and non-temporal queries.

## Validation

- `npm test -- tests/recall.unit.test.ts`
- `npm run typecheck`
- `npm run build && npm test`
