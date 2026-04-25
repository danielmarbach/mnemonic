---
title: 'Hindsight phases 1-5 review: findings addressed (consolidated)'
tags:
  - hindsight
  - recall
  - review
  - completed
lifecycle: permanent
createdAt: '2026-04-25T21:42:49.274Z'
updatedAt: '2026-04-25T21:42:49.274Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: plan-mnemonic-recall-improvements-from-hindsight-research-5b059160
    type: derives-from
  - id: hybrid-recall-design-and-implementation-0-20-0-0-23-0-350317a0
    type: related-to
  - id: performance-principles-for-file-first-mcp-and-git-backed-wor-4e7d3bc8
    type: explains
memoryVersion: 1
---
All hindsight phases 1-5 review findings have been addressed.

## HIGH issues fixed

- **H1**: `semanticRank` re-assigned after `applyGraphSpreadingActivation`. Graph-discovered candidates now get `semanticRank`.
- **H2**: `isWithinTemporalFilterWindow` returns `true` for invalid dates (fail-open instead of fail-closed).

## MEDIUM issues fixed

- **M5**: Project boost reduced from 0.15 to 0.03 (`PROJECT_SCOPE_BOOST` constant).
- **M8**: `computeHybridScore` computes lexical RRF even when `semanticRank` is undefined for rescue candidates.
- **M14**: `CANONICAL_HYBRID_WEIGHT` increased from 0.005 to 0.05.
- **M10**: Temporal query hints reordered by specificity to fix first-match-wins.
- **M12**: Added `in\s+the\s+past` temporal regex pattern.

## Deferred (no code change required)

- **M1** (mutation in-place): Acceptable, documented.
- **M2** (cross-vault): Would require storage-layer changes beyond scope.
- **M3** (graph boost cap): Acceptable for now.
- **M4** (pipeline order): Fixed by H1 (semanticRank re-assigned post-spreading).
- **M6** (English-only temporal hints): Acceptable design constraint for now.
- **M7** (filter before spread): Desired behavior, documented.
- **M9** (no cache for global scope): Acceptable.
- **M11** ("today" strict filter): Acceptable boost-only for now.
- **M13** (activation gate 0.5): Acceptable.
- **M15** (lexicalRankSignal asymmetry): Partially mitigated by M8.
- **M16** (cache invalidation spike): Acceptable.

## Design constraint compliance after fixes

- **No database/daemon/new artifacts**: PASS
- **Fail-soft to semantic-first**: PASS (H2 fixed)
- **Additive, bounded, reversible**: PASS
- **Language independence**: DEFERRED (M6)
- **One file per note**: PASS
- **No auto-relationship via LLM**: PASS

## Plan validation

Three reviews confirmed the plan-to-implementation alignment is strong with two explicit scope deltas:
- Phase 3: session-scoped cache instead of persistent per-vault cache
- Phase 4: additive boost only, no strict filtering

The master plan at `plan-mnemonic-recall-improvements-from-hindsight-research-5b059160` has been updated to reflect all completed phases.
