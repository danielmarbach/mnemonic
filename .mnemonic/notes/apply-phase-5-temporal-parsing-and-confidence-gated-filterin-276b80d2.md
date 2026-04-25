---
title: 'Apply: Phase 5 temporal parsing and confidence-gated filtering'
tags:
  - workflow
  - apply
  - phase5
  - recall
  - temporal
lifecycle: temporary
createdAt: '2026-04-25T11:54:39.968Z'
updatedAt: '2026-04-25T11:55:30.399Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: plan-phase-5-temporal-parsing-with-confidence-gated-filterin-0f45f3cd
    type: follows
  - id: review-phase-5-temporal-parsing-and-filtering-verification-9a95dfc7
    type: derives-from
memoryVersion: 1
---
# Apply: Phase 5 temporal parsing and confidence-gated filtering

## Goal

Implement Phase 5 by adding explicit temporal-window parsing and high-confidence filter gating while preserving boost-only fallback.

## Code changes

### `src/recall.ts`

- Extended `TemporalQueryHint` with:
  - `confidence: "high" | "medium" | "low"`
  - optional `filterWindowDays`
- Added explicit relative-window parser for patterns:
  - `past N <unit>`
  - `last N <unit>`
  - `the last N <unit>`
  - `in the last N <unit>`
- Added confidence assignment:
  - explicit numeric windows => `high`
  - named periods (today/this week/last month/...) => `medium`
  - broad recency cues (recent/recently/newest) => `low`
- Added filtering helpers:
  - `shouldApplyTemporalFiltering(hint)`
  - `isWithinTemporalFilterWindow(updatedAt, windowDays)`
- Kept additive recency boost (`computeTemporalRecencyBoost`) intact.

### `src/index.ts`

- Imported and used temporal filtering helpers.
- In semantic recall candidate loop:
  - apply strict date-window filtering only when `shouldApplyTemporalFiltering(...)` is true.
- In lexical rescue candidate loop:
  - applied the same strict filtering gate.
- Preserved additive temporal boost path for medium/low confidence and parser fallback.

### Tests

- Updated `tests/recall.unit.test.ts` with parser/confidence/filter helper tests.
- Added integration tests in `tests/recall-embeddings.integration.test.ts`:
  - strict explicit-window filtering for semantic candidates
  - named-period boost-only behavior
  - strict explicit-window filtering for lexical rescue candidates

## Notes

- `mode: "temporal"` output-enrichment behavior remains separate from retrieval-stage filtering/boosting logic.
