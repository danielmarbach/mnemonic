---
title: 'Review: Hindsight phases 1-5 findings addressed'
tags:
  - workflow
  - review
  - hindsight
  - recall
  - phases-1-5
lifecycle: temporary
createdAt: '2026-04-25T17:29:05.197Z'
updatedAt: '2026-04-25T17:29:05.197Z'
role: review
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
# Review: Hindsight phases 1-5 findings addressed

## Issues fixed

### HIGH

- **H1**: `semanticRank` re-assigned after `applyGraphSpreadingActivation` in src/index.ts pipeline. Graph-discovered candidates now get `semanticRank`.
- **H2**: `isWithinTemporalFilterWindow` returns `true` for invalid dates (fail-open instead of fail-closed).

### MEDIUM

- **M5**: Project boost reduced from 0.15 to 0.03 (`PROJECT_SCOPE_BOOST` constant). Both semantic scoring loop and lexical rescue path updated.
- **M8**: `computeHybridScore` now computes lexical RRF even when `semanticRank` is undefined (rescue candidates). Also handles the `lexicalRank`-only case.
- **M14**: `CANONICAL_HYBRID_WEIGHT` increased from 0.005 to 0.05 (10x).
- **M10**: Temporal query hints reordered by specificity (longer patterns first) to fix first-match-wins issue.
- **M12**: Added `in\s+the\s+past` temporal regex pattern.

### Deferred (no code change required)

- **M1** (mutation in-place): Acceptable, documented in review.
- **M2** (cross-vault): Would require storage-layer changes beyond scope.
- **M3** (graph boost cap): Acceptable for now, documented.
- **M4** (pipeline order): Fixed by H1 (semanticRank re-assigned post-spreading).
- **M6** (English-only): Acceptable design constraint for now.
- **M7** (filter before spread): Desired behavior, documented.
- **M9** (no cache for global scope): Acceptable.
- **M11** ("today" strict filter): Acceptable boost-only for now.
- **M13** (activation gate 0.5): Acceptable.
- **M15** (lexicalRankSignal asymmetry): Partially mitigated by M8.
- **M16** (cache invalidation spike): Acceptable.

## Design constraint compliance after fixes

- **No database/daemon/new artifacts**: PASS
- **Fail-soft to semantic-first**: PASS (H2 fixed)
- **Additive, bounded, reversible**: PASS (project boost reduced, RRF bounded)
- **Language independence**: FAIL (M6 deferred)
- **One file per note**: PASS
- **No auto-relationship via LLM**: PASS

## Verification evidence

- Command: `npm test`
- Result: pass
- Details: 46 files, 719 tests passed
