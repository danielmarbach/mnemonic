---
title: 'Plan: Three-channel RRF with graph rank and rank window size'
tags:
  - workflow
  - plan
  - rrf
  - ranking
lifecycle: temporary
createdAt: '2026-05-25T14:07:26.547Z'
updatedAt: '2026-05-25T16:37:55.890Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: research-rrf-ranking-improvements-article-analysis-vs-curren-3b8585ab
    type: derives-from
  - id: decision-phase-2-recall-scoring-uses-rrf-with-dense-rank-tie-7969c37d
    type: derives-from
  - id: reference-mnemonic-ranking-signals-inventory-all-scoring-for-27ae79dc
    type: derives-from
  - id: apply-three-channel-rrf-graph-rank-and-rank-window-implement-4876709b
    type: follows
memoryVersion: 1
---
## Plan: Three-channel RRF with graph rank and rank window size

Implements gaps 1 and 2 from research `research-rrf-ranking-improvements-article-analysis-vs-curren-3b8585ab`.

### Gap 1: Graph spreading as third RRF channel

**Goal**: Graph spreading activation produces an independent rank channel instead of contaminating semantic scores.

- [x] Step 1: Add `graphRank?: number` and `graphScore?: number` to `ScoredRecallCandidate` interface in `src/recall.ts`
- [x] Step 2: Refactor `applyGraphSpreadingActivation` to NOT modify `candidate.score` or `candidate.boosted`. Instead, store `graphScore` on each candidate (existing + discovered). For existing candidates: set `graphScore += propagatedScore` (accumulate graph evidence). For graph-discovered candidates: set `graphScore = propagatedScore`, `score = 0`, `boosted = 0` (they have no semantic score; graph contribution flows only through `graphRank` RRF channel, not through `boosted`)
- [x] Step 3: Assign `graphRank` using dense ranking by `graphScore` after spreading completes. Candidates with no graphScore get `graphRank = undefined`
- [x] Step 4: Update `computeHybridScore` to three-channel RRF: `RRF = 1/(K+semanticRank) + 1/(K+lexicalRank) + 1/(K+graphRank)`. Missing channels contribute 0. Canonical contribution remains weighted even when every rank channel is missing
- [x] Step 5: Remove the post-spreading `semanticRank` reassignment in `src/tools/recall.ts`. Semantic ranks now reflect the original semantic retrieval order, not graph-boosted scores
- [x] Step 6: Adjust `RRF_SCALING_FACTOR` from `3.5` to `3.0` so the three-channel max contribution stays close to the old two-channel contribution order of magnitude
- [x] Step 7: Remove all `semanticScoreForPromotion` modifications from graph spreading. Graph-discovered candidates get `semanticScoreForPromotion: 0` (same as rescue candidates). Canonical explanation promotion gates on the original semantic retrieval score, not graph-inflated scores
- [x] Step 8: Update `RetrievalEvidenceChannel` type in `src/structured-content.ts` by replacing `"graph"` with `"graph-rank"`. Update channel evidence logic in `src/tools/recall.ts` to emit `"graph-rank"` when `graphRank !== undefined`, covering both graph-discovered and graph-boosted existing candidates

**Constraint**: No changes to rescue candidate collection. Rescue candidates continue to contribute via lexical evidence only. Canonical explanation promotion only changed to remove graph-inflated semantic promotion and to preserve canonical weighting in all-ranks-missing fallback.

### Gap 2: Rank window size

**Goal**: Truncate rank lists before RRF fusion to improve top-position discrimination.

- [x] Step 9: Add `RRF_RANK_WINDOW = 100` constant to `src/recall.ts`
- [x] Step 10: When assigning `semanticRank`, `lexicalRank`, and `graphRank`, only candidates within the top `RRF_RANK_WINDOW` positions get a rank. Candidates beyond the window get `rank = undefined` for that channel (contributing 0, same as missing channel). This is truncation, not exclusion; candidates still appear via other channels
- [x] Step 11: Apply window consistently in `assignDenseRanks`: it produces 1-based ranks for positions within the window and sets rank to `undefined` for positions beyond `RRF_RANK_WINDOW`

**Constraint**: For vaults with fewer than 100 candidates, the window has zero effect. Unit coverage verifies this small-vault behavior.

### Verification

- [x] `npx tsc --noEmit` clean
- [x] `npm test -- tests/recall.unit.test.ts` passed (`57/57`)
- [x] `npm test` passed from a clean rebuild (`1131/1131`)
- [x] New unit tests in `tests/recall.unit.test.ts`:
  - Three-channel RRF computation with graphRank
  - Canonical contribution stays weighted when all rank channels are missing
  - Graph-discovered candidate has no semanticRank, gets graphRank
  - Existing semantic candidate with graph boost keeps original semantic score and boosted score
  - Rank window truncation (candidates beyond window get undefined rank)
  - Rank window has no effect when candidate count is below the window
- [x] Updated existing tests that assumed two-channel RRF or graph score modification
- [x] Dogfooding: recall query against local vault for `RRF graph rank channel rank window recall ranking improvements` returned the active plan, research, request, and apply note in top results without obvious ranking regression

**Verification note**: Early full-suite runs failed because stale ignored files in `build/` imported removed exports. Removing ignored `build/`, rebuilding from source, and rerunning the suite passed.

### Review outcome

Fresh TypeScript review found one blocker: when all ranks were missing, `computeHybridScore` returned unscaled canonical contribution. Fixed by applying `CANONICAL_HYBRID_WEIGHT` in the fallback and adding regression coverage.

### Non-goals

- Weighted RRF (deferred because there is no measured evidence)
- Changes to rescue candidate collection
- Changes to canonical explanation promotion beyond semantic promotion and weighted fallback fixes
- New persistent state or metadata fields

### Derives-from

- research-rrf-ranking-improvements-article-analysis-vs-curren-3b8585ab
- request-rrf-ranking-improvements-from-bigdata-boutique-artic-1765a16b
- decision-phase-2-recall-scoring-uses-rrf-with-dense-rank-tie-7969c37d (prior RRF decision this extends)
- reference-mnemonic-ranking-signals-inventory-all-scoring-for-27ae79dc (scoring formulas reference)
