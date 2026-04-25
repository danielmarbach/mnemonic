---
title: >-
  Decision: Phase 5 applies strict temporal filtering only for high-confidence
  explicit windows
tags:
  - workflow
  - decision
  - phase5
  - recall
  - temporal
lifecycle: permanent
createdAt: '2026-04-25T11:55:14.712Z'
updatedAt: '2026-04-25T11:55:30.633Z'
role: decision
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: apply-phase-5-temporal-parsing-and-confidence-gated-filterin-276b80d2
    type: derives-from
  - id: summary-phase-5-temporal-parsing-and-confidence-gated-filter-bc395edc
    type: explains
memoryVersion: 1
---
# Decision: Phase 5 applies strict temporal filtering only for high-confidence explicit windows

Phase 5 extends temporal retrieval by introducing confidence-aware temporal intent parsing and confidence-gated filtering.

## Decision

- Parse explicit relative windows (`past/last/the last/in the last N <unit>`) as `high` confidence temporal intent.
- Apply strict date-window filtering only for `high` confidence hints.
- Keep named periods (`this week`, `last month`, `today`, etc.) as `medium` confidence and broad recency terms (`recent`) as `low` confidence.
- For `medium/low` confidence, keep boost-only behavior and do not hard-filter candidates.

## Why

- Preserves fail-soft behavior and avoids false negatives on ambiguous temporal phrasing.
- Improves precision for explicit time-window queries.
- Maintains architecture constraints: no persistent index or new storage subsystem.

## Non-goals

- No parser-heavy absolute date normalization in this phase.
- No strict filtering on ambiguous cues.
