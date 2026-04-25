---
title: 'Research: Phase 5 temporal parsing options and filtering safety'
tags:
  - workflow
  - research
  - phase5
  - recall
  - temporal
lifecycle: temporary
createdAt: '2026-04-25T11:40:18.530Z'
updatedAt: '2026-04-25T21:43:43.820Z'
role: research
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: request-phase-5-temporal-parsing-and-confidence-gated-filter-92f587a3
    type: derives-from
  - id: plan-phase-5-temporal-parsing-with-confidence-gated-filterin-0f45f3cd
    type: derives-from
  - id: phase-5-temporal-parsing-and-confidence-gated-filtering-comp-f3271d08
    type: supersedes
memoryVersion: 1
---
# Research: Phase 5 temporal parsing options and filtering safety

## Context

Phase 4 shipped additive temporal recency boost with bounded cue detection. The remaining gap is robust temporal interpretation for date ranges and explicit periods.

## Candidate directions

1. **Parsing-only + boost (low risk)**
   - Add richer phrase normalization (today/yesterday/this week/last week/this month/last month/this year/last year + explicit ranges like "past N days").
   - Keep boost-only behavior.

2. **Parsing + confidence-gated filtering (recommended)**
   - Parse temporal intent and derive confidence score.
   - Apply strict filtering only when confidence is high and range is explicit.
   - Fall back to boost-only when confidence is medium/low.

3. **Always filter when any temporal cue appears (high risk)**
   - Highest precision when cues are exact.
   - High false-negative risk on ambiguous language.

## Risks

- Ambiguous wording can over-filter useful results.
- Language variability can reduce parser reliability.
- Filtering can violate fail-soft expectations if applied aggressively.

## Recommendation

Adopt option 2: confidence-gated filtering with boost-only fallback.

## Proposed validation focus

- Temporal recall unit tests for parser confidence and range extraction.
- Integration tests for temporal vs non-temporal query regressions.
- Dogfood pack additions for temporal ambiguity and explicit-range queries.
