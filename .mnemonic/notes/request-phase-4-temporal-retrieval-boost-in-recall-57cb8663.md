---
title: 'Request: Phase 4 temporal retrieval boost in recall'
tags:
  - workflow
  - request
  - phase4
  - recall
  - temporal
lifecycle: temporary
createdAt: '2026-04-25T10:47:53.378Z'
updatedAt: '2026-04-25T10:48:01.523Z'
role: context
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: plan-phase-4-temporal-retrieval-boost-implementation-87d668c6
    type: derives-from
memoryVersion: 1
---
# Request: Phase 4 temporal retrieval boost in recall

Implement Phase 4 from the ArXiv-derived recall improvement plan.

## Goal

Improve retrieval relevance for time-oriented queries by adding a bounded temporal recency boost based on note `updatedAt` while preserving semantic-first behavior.

## Scope

- Detect temporal intent from query cues (e.g. recent, today, this week, this month, this year).
- Apply additive temporal boost to recall candidate scoring.
- Keep fail-soft behavior when no temporal cues are present or timestamps are invalid.
- Include lexical-rescue candidates in temporal boosting.

## Success criteria

- Queries with temporal cues favor fresher notes when semantic quality is otherwise close.
- No hard filtering by date in this phase; boost-only behavior.
- No regressions in existing recall behavior for non-temporal queries.
- Typecheck and tests pass.
