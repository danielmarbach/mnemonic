---
title: 'Apply: Phase 2 internal decay evidence helper'
tags:
  - workflow
  - apply
  - decay
  - diagnostics
  - provenance
lifecycle: temporary
createdAt: '2026-05-12T20:47:07.651Z'
updatedAt: '2026-05-12T20:47:07.651Z'
role: context
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
# Apply: Phase 2 Internal Decay Evidence Helper

Implements Phase 2 of `plan-advisory-memory-health-diagnostics-from-microsoft-memor-a0aa3e62`.

## What Changed

- Added internal `computeDecayInfo` helper in `src/provenance.ts`.
- Added exported additive types: `DecayInfo`, `DecayBasis`, and `DecayMaintenanceHint`.
- Added role/lifecycle-aware conservative half-life defaults:
  - temporary workflow notes (`plan`, `research`, `review`): 30 days
  - temporary context/other notes: 45 days
  - permanent core notes (`decision`, `summary`, `reference`): 365 days
  - permanent default notes: 180 days
  - superseded notes: 30 days
- Added centrality-based half-life extension for non-superseded notes.
- Added advisory maintenance hints only as helper output: `review`, `consolidate`, `prune-superseded`.
- Normalized invalid dates, invalid `now`, negative centrality, and non-finite centrality fail-soft.
- Aligned existing `computeSignalStrength` centrality normalization with the new fail-soft behavior.

## What Did Not Change

- No MCP tool output changed.
- No structured output fields changed.
- No text output changed.
- No ranking behavior changed.
- No automatic forgetting, pruning, expiration, or lifecycle demotion was added.
- No read-path writes were added.

## Tests

Added focused tests in `tests/provenance.unit.test.ts` for:

- Exponential half-life behavior.
- Temporary workflow note consolidation hint.
- Temporary context review hint.
- Permanent core notes avoiding age-only maintenance hints.
- Centrality half-life extension.
- Superseded note prune hint with no centrality extension.
- Invalid date and non-finite numeric fail-soft behavior.
- Existing signal-strength negative centrality behavior now clamps instead of zeroing all signal.

## Validation

- `npx tsc --noEmit` — pass
- `npm test -- tests/provenance.unit.test.ts` — pass, 27 tests

## Review

Fresh TypeScript-focused review initially found:

- non-finite numeric fields could leak through `computeDecayInfo`
- `basis` should be a literal union rather than mutable `string[]`
- existing `computeSignalStrength` negative centrality handling zeroed the whole signal

All were fixed. Final review found no blockers and recommended continue.

## Follow-Up

Phase 3 can consume this helper for metadata-only project-summary maintenance warnings, but must add aligned structured and text output only when the diagnostic becomes user-visible.
