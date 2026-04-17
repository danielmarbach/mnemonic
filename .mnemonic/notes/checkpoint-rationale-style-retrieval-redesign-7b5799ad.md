---
title: 'Checkpoint: rationale-style retrieval redesign'
tags:
  - checkpoint
  - temporary-notes
  - retrieval
  - recall
  - rationale
lifecycle: temporary
createdAt: '2026-04-05T17:41:52.918Z'
updatedAt: '2026-04-17T08:43:39.216Z'
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Checkpoint for the rationale-style retrieval redesign follow-up.

## Current status: implementation complete, all tasks verified

All 5 implementation tasks are done. The canonical explanation promotion is wired into the recall pipeline with bounded scoring, language-independent primary signals, and minSimilarity-respecting rescue suppression.

## What changed

### Task 1 — Scoring guardrails (ScoredRecallCandidate extended)

- Added `semanticScoreForPromotion`, `lifecycle`, `relatedCount`, `connectionDiversity`, `structureScore`, `metadata`, `canonicalExplanationScore` to `ScoredRecallCandidate`
- Added `computeCanonicalExplanationScore` with semantic plausibility gate (MIN_CANONICAL_EXPLANATION_SCORE = 0.5)
- Added `applyCanonicalExplanationPromotion` which computes scores and re-sorts by hybrid score
- Updated `computeHybridScore` to include `canonicalExplanationScore`

### Task 2 — Wiring, lifecycle filter, rescue trigger fix, semantic gate, minSimilarity bypass

- `buildRecallCandidateContext` helper populates all new context fields from notes
- Main recall loop populates `semanticScoreForPromotion: rawScore` for semantic candidates, `0` for rescue
- `applyCanonicalExplanationPromotion` wired after `applyLexicalReranking` and after rescue
- `collectLexicalRescueCandidates` now receives `lifecycle` filter and passes it through
- Rescue trigger uses `strongestSemanticScore` from pre-rerank `scored[]` (not post-promotion)
- **minSimilarity bypass fix**: lexical rescue is suppressed when `minSimilarity > DEFAULT_MIN_SIMILARITY`
- **Bug fix discovered & resolved**: `shouldTriggerLexicalRescue` was incorrectly returning `false` for empty result sets; changed back to `return true`

### Task 3 — Rationale-query integration regression test

- Added "promotes the canonical explanatory note for why-style recall queries" test
- Verifies that "Key design decisions" ranks top-1 for "why are embeddings gitignored"

### Task 4 — Direct-answer guardrail coverage

- Added "does not displace a direct answer with a generic overview note" test
- Verifies that "API endpoint port" ranks top-1 for "what port does the local api use"

### Task 5 — Full verification

- 635/635 tests pass, 0 failures (including 3 pre-existing rescue tests now fixed)
- Typecheck passes
- Build passes

## Verification evidence

- `vitest run tests/ — 635 passed, 0 failed`
- `npm run typecheck — PASS`
- `npm run build — PASS`

## Relevant files

- `src/recall.ts` — ScoredRecallCandidate interface, scoring, promotion
- `src/index.ts` — buildRecallCandidateContext, candidate population, wiring
- `src/lexical.ts` — shouldTriggerLexicalRescue (bug fix)
- `tests/recall.unit.test.ts` — unit tests for scoring, guardrails, promotion
- `tests/recall-embeddings.integration.test.ts` — integration tests for rescue, minSimilarity, rationale query guardrails
- `docs/superpowers/specs/2026-04-17-rationale-style-retrieval-design.md` — design spec (uncommitted)
- `docs/superpowers/plans/2026-04-17-rationale-style-retrieval-implementation.md` — implementation plan (uncommitted)
