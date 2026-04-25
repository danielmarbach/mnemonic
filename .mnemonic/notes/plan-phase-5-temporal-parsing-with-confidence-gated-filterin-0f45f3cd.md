---
title: 'Plan: Phase 5 temporal parsing with confidence-gated filtering'
tags:
  - workflow
  - plan
  - phase5
  - recall
  - temporal
lifecycle: temporary
createdAt: '2026-04-25T11:40:18.666Z'
updatedAt: '2026-04-25T11:40:28.282Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
# Plan: Phase 5 temporal parsing with confidence-gated filtering

## Source

- `plan-mnemonic-recall-improvements-from-hindsight-research-5b059160`
- `research-phase-5-temporal-parsing-options-and-filtering-safe-cd641999`

- `plan-mnemonic-recall-improvements-from-hindsight-research-5b059160`
- `research-phase-5-temporal-parsing-options-and-filtering-safe-7b2ff838`

## Strategy

Implement temporal parsing in bounded steps, keeping boost-only fallback as the safety baseline.

## Execution checklist

- \[ ] Add parser primitives for explicit relative windows (`past N days`, `last N weeks`) and canonical named periods.
- \[ ] Add temporal confidence scoring (`high` | `medium` | `low`) from parser evidence quality.
- \[ ] Add filtering gate: apply strict date-window filtering only for `high` confidence explicit windows.
- \[ ] Preserve additive recency boost path for `medium/low` confidence or parsing failures.
- \[ ] Add/extend recall unit tests for parser extraction, confidence assignment, and filter gating behavior.
- \[ ] Add integration coverage for temporal precision gains and non-temporal no-regression behavior.
- \[ ] Run verification (`npm run typecheck`, focused temporal tests, `npm test`).

## Constraints

- No persistent index or new storage subsystem.
- No hard filtering on ambiguous cues.
- Maintain fail-soft behavior across all parsing failures.

## Exit criteria

- Temporal explicit-range queries show improved precision.
- Ambiguous temporal queries remain safe via boost-only fallback.
- Non-temporal queries remain unchanged.
