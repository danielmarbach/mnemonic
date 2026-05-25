---
title: >-
  Research: RRF ranking improvements — article analysis vs current
  implementation
tags:
  - workflow
  - research
  - rrf
  - ranking
lifecycle: temporary
createdAt: '2026-05-25T14:06:16.108Z'
updatedAt: '2026-05-25T14:07:30.124Z'
role: research
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
## Research: RRF Ranking Improvements — Article Analysis vs Current Implementation

Sources: BigData Boutique RRF article (2026-05-18), Cormack-Clarke-Büttcher 2009 SIGIR paper, Mnemonic codebase (`src/recall.ts`, `src/tools/recall.ts`).

### Article key findings

**RRF principle**: Each retriever votes for a document by rank position. `RRF_score(d) = Σ_r 1/(k + rank_r(d))`. Operates on ranks, not scores — robust to mismatched score distributions.

**K=60 justification**: Cormack et al. tuned on TREC data; subsequent benchmarks land k ∈ [40, 80]. Smaller k amplifies top ranks (high-precision workloads), larger k preserves long-tail signal (recall-oriented).

**Multi-retriever fusion**: Formula naturally extends to 3+ retrievers. "Practical examples include BM25 + dense + sparse (e.g., SPLADE), or text + image + metadata retrievers in multimodal search."

**Weighted RRF**: `Σ_r w_r / (k + rank_r(d))` for asymmetric retriever confidence. Article advises: "don't reach for weights until you've measured."

**Rank window size**: 50-100 per retriever before fusion. "A true positive at rank 80 in one list and rank 5 in the other will get half the score it deserves if your window is 50." Documents outside window contribute 0.

**Score normalization comparison**: RRF ~3.86% lower NDCG@10 vs tuned score normalization in OpenSearch benchmarks but faster at every latency percentile and immune to score-distribution drift.

**Single-list documents**: Contribute reciprocal-rank from one list, 0 from the other — penalized relative to documents present in both. "Exactly the behavior you want from a hybrid ranker."

### Current Mnemonic implementation

**Formula** (`src/recall.ts:197-217`):

```text
RRF = 1/(60 + semanticRank) + 1/(60 + lexicalRank)
hybridScore = boosted + RRF * 3.5 + canonicalScore * 0.05
```

Two channels: semantic rank (dense by raw cosine score) and lexical rank (dense by lexicalRankSignal = lexical + coverage×0.3 + phrase×0.5).

**Graph spreading activation** (`src/recall.ts:478-537`):

- Top 5 entry points with score >= 0.5
- propagatedScore = entry.score × 0.5 × multiplier
- Modifies `candidate.score` and `candidate.boosted` directly (lines 507-524)
- Discovered candidates get `semanticScoreForPromotion = propagatedScore`
- After spreading, `semanticRank` is re-assigned based on modified scores (`src/tools/recall.ts:308-311`)

**Canonical explanation promotion**: Separate additive term (0.05 weight), gated on semanticScoreForPromotion >= 0.5.

**No rank window**: All candidates above minSimilarity enter RRF ranking.

### Gap analysis

#### Gap 1: Graph spreading contaminates semantic rank (CRITICAL)

Current behavior: Graph-propagated scores are added to `candidate.score` and `candidate.boosted`, then `semanticRank` is re-assigned based on these contaminated scores. Graph-discovered candidates (which were never found by semantic search) inherit `semanticRank` based on their propagated score.

**Why this violates RRF design**:

- RRF requires each channel to produce independent rank lists
- Graph-boosted existing candidates get inflated semantic scores, distorting the semantic rank order
- Graph-discovered candidates (no genuine semantic similarity) get a `semanticRank` that doesn't reflect actual semantic retrieval — it reflects graph proximity
- The article's worked example shows RRF rewards "consistency across lists" — but here graph discovery pretends to be semantic consistency

**Concrete problem scenario**:

Candidate A: semantic score 0.55, semanticRank=1. Graph spreads +0.15 → score becomes 0.70, semanticRank stays 1 (fine).
Candidate B: semantic score 0.54, semanticRank=2. No graph boost. After re-ranking, candidate A's inflated 0.70 vs B's 0.54 creates a wider gap than the original 0.55 vs 0.54 warranted. The lexical channel could have promoted B, but A's inflated score makes lexical rescue less effective.

Candidate C (graph-discovered): propagatedScore = 0.35. After spreading and re-ranking, gets semanticRank based on 0.35 — but this note was never semantically retrieved. It has no genuine semantic rank. It should contribute through a graph channel, not a fake semantic one.

**Proposed fix**: Add `graphRank?: number` to `ScoredRecallCandidate`. Graph candidates get no `semanticRank` (they weren't semantically retrieved) and instead get `graphRank` assigned by spreading activation score. The formula becomes three-channel RRF:

```text
RRF = 1/(K + semanticRank) + 1/(K + lexicalRank) + 1/(K + graphRank)
```

Candidates present in all three channels (semantic + lexical + graph) naturally rise. Graph-only candidates contribute through their graph term only — exactly as rescue candidates currently contribute through their lexical term only.

**Impact on existing candidates**: Currently, graph-spreading boosts existing candidates' `score` and `boosted`, which inflates their RRF position. With the fix, existing semantic candidates keep their pure `semanticRank` (no contamination), and the graph contribution comes through `1/(K + graphRank)` instead. This is more principled and gives RRF its intended semantics.

**Impact on RRF_SCALING_FACTOR**: With three channels, max RRF ≈ 3/60 ≈ 0.050. At 3.5× → 0.175. May need slight reduction to 3.0 to keep max RRF contribution ≈ 0.150 (similar to old two-channel behavior). Requires dogfooding calibration.

#### Gap 2: No rank window size (MEDIUM)

Current: All candidates above minSimilarity (0.3) enter RRF. No upper bound.

**Why this matters**: The article emphasizes rank window size (50-100) because "documents outside the window contribute 0, so a true positive that lives at rank 80 in one list and rank 5 in the other will get half the score it deserves if your window is 50." Without a window, the RRF curve is flattened too gently for long-tail candidates, reducing discrimination in the interesting top 10-20 positions.

**Mnemonic-specific consideration**: Mnemonic vaults are typically 50-300 notes, not the millions in search engine scenarios. A window of 100 would capture nearly all candidates. The benefit is marginal for small vaults. However, for vaults approaching 500+ notes (seen in dogfooding), a rank window prevents noisy low-signal candidates from diluting the RRF sum.

**Proposed fix**: Cap eligible candidates per rank channel. When candidate count > RANK_WINDOW (e.g., 100), only candidates with rank <= RANK_WINDOW contribute from that channel. Simple truncation, not filtering — candidates below the window still appear in other channels.

**Implementation cost**: Low. Add a constant and truncate the sorted arrays before `assignDenseRanks`.

**Risk**: For small vaults (< 100 notes), the window has zero effect. No regression risk. For large vaults, removes noise from tail candidates.

#### Gap 3: Weighted RRF (LOW, deferred)

The article describes `Σ_r w_r / (k + rank_r(d))` for asymmetric retriever confidence. Requires measured evidence that one channel systematically outperforms. No such evidence exists for Mnemonic. Deferring until evaluation data exists.

### Design constraints preserved

- No database, daemon, or new committed artifacts
- Fail-soft to semantic-first behavior
- Additive, bounded, reversible
- Language-independent
- One file per note

### Derives-from

- request-rrf-ranking-improvements-from-bigdata-boutique-artic-1765a16b
- decision-phase-2-recall-scoring-uses-rrf-with-dense-rank-tie-7969c37d
- reference-mnemonic-ranking-signals-inventory-all-scoring-for-27ae79dc
