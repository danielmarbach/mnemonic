---
title: 'Summary: Hindsight phases 1-5 review findings addressed'
tags:
  - workflow
  - summary
  - hindsight
  - recall
  - phases-1-5
lifecycle: permanent
createdAt: '2026-04-25T17:30:01.290Z'
updatedAt: '2026-04-25T17:30:01.290Z'
role: summary
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
# Summary: Hindsight phases 1-5 review findings addressed

All findings from the comprehensive hindsight phases 1-5 code and plan audit have been reviewed and addressed.

## Key changes

1. **H1 - Stale semanticRank**: Added semantic rank re-assignment after graph spreading activation in the recall pipeline (src/index.ts). Graph-discovered candidates now receive proper `semanticRank`.
2. **H2 - Fail-closed temporal filtering**: Changed `isWithinTemporalFilterWindow` to return `true` for invalid dates instead of `false`, honoring the fail-soft design principle.
3. **M5 - Project boost reduced**: Inline `0.15` project scope boost replaced with `PROJECT_SCOPE_BOOST = 0.03` constant in both semantic scoring and lexical rescue paths.
4. **M8 - Rescue lexical ranking**: `computeHybridScore` now handles the lexical-only RRF path (rescue candidates with `lexicalRank` but no `semanticRank`).
5. **M14 - Canonical weight increased**: `CANONICAL_HYBRID_WEIGHT` from 0.005 to 0.05 (10x increase, still a small contribution).
6. **M10/M12 - Temporal hint patterns**: Hints reordered by specificity; added "in the past" pattern.

## Test results

All 719 tests pass across 46 test files.
