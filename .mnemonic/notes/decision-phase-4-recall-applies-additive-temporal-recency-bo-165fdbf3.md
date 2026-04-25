---
title: 'Decision: Phase 4 recall applies additive temporal recency boost'
tags:
  - workflow
  - decision
  - phase4
  - recall
  - temporal
lifecycle: permanent
createdAt: '2026-04-25T10:50:44.115Z'
updatedAt: '2026-04-25T21:43:36.049Z'
role: decision
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: apply-phase-4-temporal-retrieval-boost-in-recall-pipeline-5416111e
    type: derives-from
  - id: summary-phase-4-temporal-retrieval-boost-completed-1e1ab210
    type: explains
  - id: phase-4-temporal-retrieval-boost-completed-e5a5dec8
    type: supersedes
memoryVersion: 1
---
# Decision: Phase 4 recall applies additive temporal recency boost

Recall now applies an additive temporal recency boost when query text expresses temporal intent.

## Decision

- Detect temporal intent from bounded cue phrases in the query.
- Compute recency boost from `updatedAt` using linear decay inside a window.
- Add temporal boost to candidate `boosted` score for both semantic and lexical-rescue candidates.

## Why

- Improves ranking for time-oriented queries without changing retrieval architecture.
- Keeps phase scope low-risk and reversible.

## Non-goals

- No strict date filtering in this phase.
- No natural-language date parser integration yet.

## Constraints honored

- Additive, bounded, fail-soft behavior.
- Existing non-temporal recall behavior remains stable.
