---
title: Hybrid recall implementation completed (0.20.0)
tags:
  - recall
  - hybrid-search
  - completed
  - lexical
lifecycle: permanent
createdAt: '2026-04-04T12:30:29.363Z'
updatedAt: '2026-04-04T12:30:29.363Z'
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Hybrid recall implementation is complete and shipped in 0.20.0 (2026-04-04).

## What was delivered

- `src/lexical.ts` — normalization, tokenization, Jaccard/bigram/substring scoring, confidence gate
- `src/recall.ts` — `lexicalScore` on `ScoredRecallCandidate`, `computeHybridScore`, `applyLexicalReranking`
- `src/index.ts` — `collectLexicalRescueCandidates` helper, hybrid recall integration in recall handler

## Key design choices

- Lexical scores act as tiebreakers (12% weight) — cannot overcome large semantic gaps
- Rescue triggers when top semantic score < 0.35 or no results exist
- Rescue bounded to 3 candidates max, scanned from projections only
- All lexical operations fail-soft to pure semantic behavior

## Test results

- 48 new tests for lexical utilities and hybrid reranking
- Full suite: 574 tests passing, 0 failures
- TypeScript compilation clean

## Definition of done — all met

- semantic-first behavior preserved
- better exact-match and weak-query recall where lexical evidence is strong
- no new storage layer or synced state
- no token growth in default output
- lexical/projection failures degrade gracefully to existing behavior

The original implementation plan note (`phase-1-implementation-plan-bounded-fail-soft-hybrid-recall-a416e489`) and design note (`phase-1-design-hybrid-recall-over-existing-projections-4dc7dbb9`) should be updated to reflect completion status.
