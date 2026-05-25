---
title: 'Plan: Three-channel RRF with graph rank and rank window size'
tags:
  - workflow
  - plan
  - rrf
  - ranking
lifecycle: temporary
createdAt: '2026-05-25T14:07:26.547Z'
updatedAt: '2026-05-25T14:17:34.050Z'
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
memoryVersion: 1
---
## Plan: Three-channel RRF with graph rank and rank window size

Implements gaps 1 and 2 from research `research-rrf-ranking-improvements-article-analysis-vs-curren-3b8585ab`.

### Gap 1: Graph spreading as third RRF channel

**Goal**: Graph spreading activation produces an independent rank channel instead of contaminating semantic scores.

- \[ ] Step 1: Add `graphRank?: number` and `graphScore?: number` to `ScoredRecallCandidate` interface in `src/recall.ts`
- \[ ] Step 2: Refactor `applyGraphSpreadingActivation` to NOT modify `candidate.score` or `candidate.boosted`. Instead, store `graphScore` on each candidate (existing + discovered). For existing candidates: set `graphScore += propagatedScore` (accumulate graph evidence). For graph-discovered candidates: set `graphScore = propagatedScore`, `score = 0`, `boosted = 0` (they have no semantic score — graph contribution flows only through `graphRank` RRF channel, not through `boosted`)
- \[ ] Step 3: Assign `graphRank` using dense ranking by `graphScore` after spreading completes. Candidates with no graphScore get `graphRank = undefined`
- \[ ] Step 4: Update `computeHybridScore` to three-channel RRF: `RRF = 1/(K+semanticRank) + 1/(K+lexicalRank) + 1/(K+graphRank)`. Missing channels contribute 0 (same pattern as current missing-rank handling)
- \[ ] Step 5: Remove the post-spreading `semanticRank` reassignment in `src/tools/recall.ts:306-311`. Semantic ranks must reflect the original semantic retrieval order, not graph-boosted scores
- \[ ] Step 6: Adjust `RRF_SCALING_FACTOR`. With three channels, max RRF ≈ 3/60 ≈ 0.050. At current 3.5× → 0.175. Reduce to 3.0× so max RRF contribution ≈ 0.150 (close to old two-channel max of ~0.115). Dogfooding will validate
- \[ ] Step 7: Remove all `semanticScoreForPromotion` modifications from graph spreading — both the `+= propagatedScore` on existing candidates (line 509-510) AND the initial `semanticScoreForPromotion: propagatedScore` on discovered candidates (line 516). Graph-discovered candidates should get `semanticScoreForPromotion: 0` (same as rescue candidates). Canonical explanation promotion gates on the original semantic retrieval score, not graph-inflated scores. Graph contribution already flows through the graphRank RRF channel
- \[ ] Step 8: Update `RetrievalEvidenceChannel` type in `src/structured-content.ts` — replace `"graph"` with `"graph-rank"` in the union type. Update the channel evidence logic in `src/tools/recall.ts` to emit `"graph-rank"` when `graphRank !== undefined`, replacing the current `graphDiscoveredIds.has(id)` check. This covers both graph-discovered AND graph-boosted-existing candidates

**Constraint**: No changes to rescue candidates — they continue to contribute only via `lexicalRank`. No changes to canonical explanation promotion logic beyond `semanticScoreForPromotion` fix.

**Goal**: Graph spreading activation produces an independent rank channel instead of contaminating semantic scores.

- \[ ] Step 1: Add `graphRank?: number` and `graphScore?: number` to `ScoredRecallCandidate` interface in `src/recall.ts`
- \[ ] Step 2: Refactor `applyGraphSpreadingActivation` to NOT modify `candidate.score` or `candidate.boosted`. Instead, store `graphScore` on each candidate (existing + discovered). Graph-discovered candidates keep `semanticRank = undefined`; existing candidates keep their original `semanticRank`
- \[ ] Step 3: Assign `graphRank` using dense ranking by `graphScore` after spreading completes. Candidates with no graphScore get `graphRank = undefined`
- \[ ] Step 4: Update `computeHybridScore` to three-channel RRF: `RRF = 1/(K+semanticRank) + 1/(K+lexicalRank) + 1/(K+graphRank)`. Missing channels contribute 0 (same pattern as current missing-rank handling)
- \[ ] Step 5: Remove the post-spreading `semanticRank` reassignment in `src/tools/recall.ts:306-311`. Semantic ranks must reflect the original semantic retrieval order, not graph-boosted scores
- \[ ] Step 6: Adjust `RRF_SCALING_FACTOR`. With three channels, max RRF ≈ 3/60 ≈ 0.050. At current 3.5× → 0.175. Reduce to 3.0× so max RRF contribution ≈ 0.150 (close to old two-channel max of ~0.115). Dogfooding will validate
- \[ ] Step 7: Remove `semanticScoreForPromotion += propagatedScore` from graph spreading. Canonical explanation promotion should gate on the original semantic retrieval score, not graph-inflated scores. Graph contribution already flows through the graphRank RRF channel
- \[ ] Step 8: Update `RetrievalEvidence` channels in `src/tools/recall.ts` to include `"graph-rank"` when `graphRank !== undefined` instead of the current `"graph"` channel (which was based on membership in `graphDiscoveredIds`). Both graph-discovered AND graph-boosted-existing candidates now have `graphRank`

**Constraint**: No changes to rescue candidates — they continue to contribute only via `lexicalRank`. No changes to canonical explanation promotion logic beyond the `semanticScoreForPromotion` fix.

### Gap 2: Rank window size

**Goal**: Truncate rank lists before RRF fusion to improve top-position discrimination.

- \[ ] Step 9: Add `RRF_RANK_WINDOW = 100` constant to `src/recall.ts`
- \[ ] Step 10: When assigning `semanticRank`, `lexicalRank`, and `graphRank` — only candidates within the top `RRF_RANK_WINDOW` positions get a rank. Candidates beyond the window get `rank = undefined` for that channel (contributing 0, same as missing channel). This is truncation, not exclusion — candidates still appear via other channels
- \[ ] Step 11: Apply window consistently: `assignDenseRanks` already produces 1-based ranks. After assignment, set rank to `undefined` for positions > RRF\_RANK\_WINDOW

**Constraint**: For vaults with < 100 candidates, the window has zero effect. No regression risk for small vaults.

### Verification

- \[ ] `npx tsc --noEmit` clean
- \[ ] `npm test` — all existing tests updated for three-channel RRF semantics
- \[ ] New unit tests in `tests/recall.unit.test.ts`:
  - Three-channel RRF computation with graphRank
  - Graph-discovered candidate has no semanticRank, gets graphRank
  - Existing semantic candidate with graph boost keeps original semanticRank
  - Rank window truncation (candidates beyond window get undefined rank)
  - Rank window has no effect when candidate count < window
- \[ ] Update existing tests that assume two-channel RRF or graph score modification
- \[ ] Dogfooding: recall queries against local vault, verify no ranking regression

### Non-goals

- Weighted RRF (deferred — no measured evidence)
- Changes to rescue candidate logic
- Changes to canonical explanation promotion beyond semanticScoreForPromotion fix
- New persistent state or metadata fields

### Derives-from

- research-rrf-ranking-improvements-article-analysis-vs-curren-3b8585ab
- request-rrf-ranking-improvements-from-bigdata-boutique-artic-1765a16b
