---
title: >-
  Reference: Mnemonic ranking signals inventory — all scoring formulas across
  codebase
tags:
  - reference
  - ranking
  - scoring
  - signals
  - design
lifecycle: permanent
createdAt: '2026-05-09T15:25:30.750Z'
updatedAt: '2026-05-09T21:03:51.510Z'
role: reference
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: research-semvec-retention-formula-deep-dive-applicability-to-a5a31ecd
    type: derives-from
  - id: enriched-confidence-scoring-with-signal-strength-composite-i-06563116
    type: derives-from
memoryVersion: 1
---
## Reference: Mnemonic Ranking Signals Inventory

Comprehensive inventory of every scoring formula and signal across the codebase. Captured during semvec research (May 2026) for future ranking work.

### 1. Recall Pipeline

Source: `src/recall.ts`, `src/tools/recall.ts`, `src/tools/recall-helpers.ts`

**Semantic embedding score** (`src/embeddings.ts:54-63`):
Standard cosine similarity between query embedding and note embedding. Ollama model: nomic-embed-text-v2-moe (default). Values in [0, 1]. Minimum gate: 0.3.

**Base boost** (`src/tools/recall.ts:229`):

```text
boosted = rawScore + projectScopeBoost + metadataBoost + temporalBoost
```

- projectScopeBoost: 0.03 if isCurrentProject, else 0
- metadataBoost: see below
- temporalBoost: see below

**Metadata boost** (`src/recall.ts:71-93`):

```text
alwaysLoad (explicit): +0.01
role=summary:         +0.012
role=decision:        +0.009
importance=high:      +0.006
```

All additive. AlwaysLoad only fires when explicitly set.

**Temporal recency boost** (`src/recall.ts:95-164`):
Two-tier detection:

- Tier 1 (explicit window patterns): matches "in the last N days/weeks/months/years", sets windowDays from capture groups, confidence=high
- Tier 2 (natural language): today/latest (2d, 0.08), yesterday (3d, 0.08), this week (7d, 0.06), last week (14d, 0.06), this month (31d, 0.05), last month (62d, 0.05), recent/recently/newest (30d, 0.05), this year/last year (366d, 0.03), in the past (365d, 0.03)

Formula: freshness = 1 - (ageDays / windowDays), boost = maxBoost * freshness. Linear decay to zero at window boundary. When confidence=high, notes outside window are *filtered out* entirely (not just deboosted).

**Lexical reranking** (`src/recall.ts:219-329`, `src/lexical.ts:74-92`):

lexicalScore = 0.4 *substringScore + 0.35* bigramJaccardScore + 0.25 * unigramJaccardScore

Plus coverageScore (IDF-weighted query token coverage) and phraseScore (contiguous match of significant tokens).

```text
lexicalRankSignal = lexicalScore + coverageScore * 0.3 + phraseScore * 0.5
```

**Graph spreading activation** (`src/recall.ts:477-536`):

- Top 5 entry points with score >= 0.5
- propagatedScore = entry.score *0.5* multiplier
- multiplier: explains/derives-from = 1.0, related-to/example-of/supersedes/follows = 0.8
- New candidates added if not already present

**Canonical explanation promotion** (`src/recall.ts:262-296`):
Gate: semanticScoreForPromotion >= 0.5.

```text
canonicalScore = permanence + role + centrality + diversity + structure + wording
```

- permanence: 0.05 if permanent
- role: 0.05 decision, 0.04 context, 0.02 summary
- centrality: log(relations+1) * 0.02, capped 0.05
- diversity: connectionDiversity * 0.015, capped 0.04
- structure: structureScore, capped 0.03
- wording: lexicalScore, capped 0.01

**Final hybrid score** (`src/recall.ts:196-217`):

```text
RRF = 1/(60 + semanticRank) + 1/(60 + lexicalRank)
hybridScore = boosted + RRF * 3.5 + canonicalScore * 0.05
```

RRF_K=60, RRF_SCALING_FACTOR=3.5, CANONICAL_HYBRID_WEIGHT=0.05.

**Lexical rescue** (`src/lexical.ts:302-332`, `src/tools/recall-helpers.ts:36-170`):
Triggers when semanticResultCount=0 or topSemanticScore < 0.35 and caller didn't raise minSimilarity. Ranks all non-candidate notes by TF-IDF cosine similarity. Threshold: 0.15. Takes top 3. Rescue candidates get semanticScoreForPromotion=0 (never qualify for canonical promotion).

**Result selection** (`src/recall.ts:395-419`):
For scope "all": fills limit with project-scoped results first, then backfills with non-project. For "project" or "global": takes top N directly.

### 2. Project Memory Summary

Source: `src/tools/project-memory-summary.ts`, `src/project-introspection.ts`

**Within-theme score** (`src/project-introspection.ts:161-197`):

```text
recency = 1.0 - min(daysSinceUpdate, 30) / 30
centrality = min(0.2, log(relations+1) * 0.1)
metadataBonus = roleWeight + importanceWeight (separate explicit/suggested weights)
```

Role weights (explicit/suggested): summary 0.18/0.06, decision 0.12/0.04, reference 0.06/0.02, context 0.03/0.01.
Importance weights: high 0.12/0.04, normal 0.06/0.02.

**Anchor score** (`src/project-introspection.ts:219-249`):

```text
anchorScore = 0.4 * log(relations+1) + 0.4 * connectionDiversity
            + 0.2 * (1 / (1 + days/7)) + roleBonus + importanceBonus + alwaysLoadBonus
```

- AlwaysLoad explicit bonus: +0.45 (single largest metadata boost)
- Role bonuses: summary 0.22/0.08, decision 0.16/0.06, reference 0.08/0.03, context 0.04/0.015
- Importance bonuses: high 0.20/0.06, normal 0.10/0.03
- Must be alwaysLoad OR have explicit orientation role OR have visible graph participation
- Max 2 per theme, max 10 total

**Working state score** (`src/project-introspection.ts:252-307`):

```text
recency = min(1.2, 1.2 / (1 + days/3))
connectivity = min(0.3, log(relations+1) * 0.12)
structureBonus = min(0.22, headingCount*0.05 + bulletCount*0.02
                    + numberedCount*0.03 + taskCount*0.03 + paragraphBonus)
```

Role weights: plan 0.18/0.06, context 0.12/0.04, summary 0.08/0.025, decision 0.04/0.015, reference 0.02/0.01.
Importance weights: high 0.16/0.05, normal 0.08/0.025.

### 3. Confidence Scoring

Source: `src/provenance.ts:104-120`

```text
high:   lifecycle=permanent AND centrality>=5 AND daysSinceUpdate<30
medium: daysSinceUpdate<90
low:    otherwise
```

### 4. Importance Inference

Source: `src/role-suggestions.ts:127-163`

HIGH: lifecycle=permanent, inbound>=4, linkedByPermanentNotes>=2, combined structural+graph>=10.
NORMAL: lifecycle=permanent, graphSignal>=1, (connections>=2 OR structural>=2).
Never auto-suggests "low".

### 5. Consolidation

Source: `src/consolidate.ts`, `src/tools/consolidate-helpers.ts`

Duplicate detection: cosine similarity between note embeddings. Default threshold 0.85. Groups by similarity then produces merge suggestions with lifecycle/role/age/risk evidence. Risk derived from warnings count and supersedes chain presence.

### 6. Auto-Relate

Source: `src/auto-relate.ts:67-102`

```text
score = explicitTitleMention + lexicalScore*0.45 + titleTokenOverlap*0.2
      + sharedTagScore (max 3 tags * 0.08) + recency * 0.05
```

Min score 0.32. Max 2 auto-relationships per write.

### Key Structural Observations

**AlwaysLoad is the dominant metadata signal:** +0.45 in anchor scoring dwarfs every other single signal. The only comparable term is centrality (0.4 weighted in anchor scoring).

**Importance is always a secondary term:** Never exceeds +0.20 in any context. Always additive, never multiplicative.

**Recency is present everywhere but with different decay curves:** linear (within-theme, temporal boost), exponential half-life (anchor=7d, working-state=3d), binary gate (confidence).

**Access count is completely absent:** Nothing tracks retrieval frequency. Adding it would require persistent counters on read paths, violating multiple design constraints.
