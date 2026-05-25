---
title: 'Apply: three-channel RRF graph rank and rank window implementation'
tags:
  - workflow
  - apply
  - rrf
  - ranking
lifecycle: temporary
createdAt: '2026-05-25T16:05:13.044Z'
updatedAt: '2026-05-25T16:05:21.293Z'
role: context
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: plan-three-channel-rrf-with-graph-rank-and-rank-window-size-1c7d15da
    type: follows
memoryVersion: 1
---
# Apply: Three-channel RRF graph rank and rank window implementation

Implemented the RRF plan in source and tests.

## Changed files

- `src/recall.ts`
- `src/tools/recall.ts`
- `src/structured-content.ts`
- `tests/recall.unit.test.ts`

## Delivered changes

- Added `graphScore?: number` and `graphRank?: number` to `ScoredRecallCandidate`.
- Changed graph spreading activation to accumulate independent `graphScore` instead of mutating `score`, `boosted`, or semantic promotion score.
- Graph-discovered candidates now start with `score = 0`, `boosted = 0`, `semanticScoreForPromotion = 0`, and rank only via `graphRank` unless another channel provides evidence.
- Assigned graph ranks by dense ranking over `graphScore` after graph spreading.
- Changed hybrid scoring to three-channel RRF: semantic, lexical, and graph-rank.
- Reduced `RRF_SCALING_FACTOR` from `3.5` to `3.0` for the third channel.
- Removed post-graph-spread semantic rank reassignment in `src/tools/recall.ts`.
- Changed retrieval evidence channel from `graph` to `graph-rank` and now emits it whenever `graphRank !== undefined`.
- Added `RRF_RANK_WINDOW = 100` and applied rank-window truncation through `assignDenseRanks` for semantic, lexical, and graph channels.
- Changed lexical rank assignment to require lexical evidence so graph-only candidates do not receive fake lexical contribution.

## Tests updated

- Added unit coverage for graphRank contribution to hybrid scoring.
- Added semantic rank window truncation and small-set no-op coverage.
- Updated graph spreading tests to assert score/boosted/semantic promotion are not contaminated.
- Added graph rank window truncation coverage.
- Updated canonical promotion test to use explicit graph channel evidence.

## Verification

- Command: `npx tsc --noEmit`
- Result: pass
- Details: no TypeScript errors.

- Command: `npm test -- tests/recall.unit.test.ts`
- Result: pass
- Details: 56/56 recall unit tests passed.

- Command: `npm test`
- Result: pass after rebuild
- Details: first run failed due stale `build/` artifact importing removed `summarizePreview`; after `npm run build`, full suite passed 1130/1130.

- Command: dogfood recall query `RRF graph rank channel rank window recall ranking improvements`
- Result: pass
- Details: returned the active RRF plan, research, and request as top results without obvious ranking regression.

## Constraints checked

- No new database, daemon, persisted ranking state, or third-party dependency.
- Rescue candidate collection unchanged.
- Canonical explanation promotion still gates on semantic plausibility; graph-discovered candidates use `semanticScoreForPromotion = 0`.
- Semantic ranks remain based on original semantic retrieval ordering.
- Graph evidence flows through `graphRank` instead of raw score mutation.
- Rank window truncates channel contribution, not candidate inclusion.
