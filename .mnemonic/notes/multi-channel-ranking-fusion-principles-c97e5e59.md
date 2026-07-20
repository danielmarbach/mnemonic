---
title: Multi-channel ranking fusion principles
tags:
  - principles
  - ranking
  - rrf
  - hybrid-search
  - recall
lifecycle: permanent
createdAt: '2026-05-25T17:37:51.641Z'
updatedAt: '2026-07-20T16:48:31.449Z'
role: reference
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: canonical-design-bounded-rrf-hybrid-recall-172a96ab
    type: supersedes
memoryVersion: 1
---
# Multi-Channel Ranking Fusion Principles

Principles for combining multiple independent retrieval channels into a single ranking, derived from RRF implementation in mnemonic.

## Core Principle: Keep Channels Independent

Each retrieval channel must produce its own rank list independently. Never let one channel contaminate another's scores or ranks.

- Semantic retrieval produces `semanticRank` based on pure cosine similarity
- Lexical retrieval produces `lexicalRank` based on token overlap
- Graph traversal produces `graphRank` based on relationship spreading activation
- Each channel assigns ranks without knowing what the others found

## Fusion Formula

Reciprocal Rank Fusion naturally extends to N channels:

```text
RRF_score(d) = Σ_ranks 1/(K + rank_r(d))
```

- K is a tuning constant (traditionally 60 from Cormack et al.)
- Missing channels contribute 0
- Documents present in multiple channels naturally score higher

## Score Contamination Anti-Pattern

Modifying one channel's scores based on another channel's evidence breaks fusion semantics:

- Graph spreading activation must NOT add to semantic scores or reassign semantic ranks
- Semantic ranks must reflect the original retrieval ordering, not post-boost ordering
- Contamination makes lexical rescue less effective because it widens score gaps artificially

## Rank Window for Top Discrimination

For large result sets, truncate rank lists before fusion:

- Only candidates with rank ≤ RANK_WINDOW contribute from that channel
- Candidates beyond the window contribute 0 from that channel (not excluded entirely)
- For vaults with fewer candidates than the window, truncation has zero effect
- Prevents noisy tail candidates from diluting top-position discrimination

## Scaling Factor Adjustment

When adding channels, adjust the scaling factor to keep total contribution magnitude stable:

- Two channels at K=60: max RRF = 2/60 ≈ 0.033
- Three channels at K=60: max RRF = 3/60 = 0.050
- Reduce `RRF_SCALING_FACTOR` proportionally to maintain similar contribution magnitude

## Rescue Candidates

Candidates discovered by only one channel (e.g. lexical-only or graph-only) still contribute through that channel alone. The fusion formula naturally handles this — they get one reciprocal rank term instead of multiple.

## Verification Requirements

- Each channel must have independent unit tests for rank assignment
- Fusion tests must verify multi-channel presence amplifies ranking
- Missing-channel tests must verify single-channel candidates still rank
- Score contamination must be explicitly tested against (e.g. graph spreading must not modify semantic scores)
