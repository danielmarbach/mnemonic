---
title: 'Apply: Phase 4 temporal retrieval boost in recall pipeline'
tags:
  - workflow
  - apply
  - phase4
  - recall
  - temporal
lifecycle: temporary
createdAt: '2026-04-25T10:50:28.987Z'
updatedAt: '2026-04-25T21:43:36.049Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: plan-phase-4-temporal-retrieval-boost-implementation-87d668c6
    type: follows
  - id: review-phase-4-temporal-retrieval-boost-verification-d978dbdf
    type: derives-from
  - id: decision-phase-4-recall-applies-additive-temporal-recency-bo-165fdbf3
    type: derives-from
  - id: phase-4-temporal-retrieval-boost-completed-e5a5dec8
    type: supersedes
memoryVersion: 1
---
# Apply: Phase 4 temporal retrieval boost in recall pipeline

## Goal

Add bounded temporal recency boosting for time-oriented recall queries while preserving semantic-first behavior.

## Implementation

### `src/recall.ts`

- Added `TemporalQueryHint` type.
- Added temporal cue detection via `detectTemporalQueryHint(query)` with bounded windows for phrases like `today`, `recent`, `this week`, `last month`, and `this year`.
- Added `computeTemporalRecencyBoost(updatedAt, hint, now)`:
  - returns `0` for invalid dates or notes outside the hint window;
  - applies linear decay inside the window up to `hint.maxBoost`.

### `src/index.ts`

- Detect temporal query hint once per recall call.
- Applied temporal boost to semantic recall candidate boost composition.
- Applied temporal boost to lexical rescue candidate boost composition for parity.

### `tests/recall.unit.test.ts`

- Added tests for temporal cue detection.
- Added tests for no-cue behavior.
- Added tests for recency ordering and out-of-window zero boost.

## Behavior

- Non-temporal queries remain unchanged.
- Temporal cue queries receive additive recency nudging only (no strict filtering in this phase).
