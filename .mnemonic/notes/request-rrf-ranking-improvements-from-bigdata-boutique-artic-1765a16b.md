---
title: 'Request: RRF ranking improvements from BigData Boutique article analysis'
tags:
  - workflow
  - request
lifecycle: temporary
createdAt: '2026-05-25T14:05:42.422Z'
updatedAt: '2026-05-25T14:05:42.422Z'
role: context
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
## Request: RRF Ranking Improvements from BigData Boutique Article Analysis

Analyze the BigData Boutique RRF article (<https://bigdataboutique.com/blog/reciprocal-rank-fusion-how-it-works-and-when-to-use-it>) against Mnemonic's current recall ranking implementation and identify concrete, implementable improvements.

### Trigger

User asked "what can we apply to improve the ranking?" after recalling existing RRF design decisions.

### Identified improvement candidates

1. Graph spreading activation as third RRF channel (not score contamination)
2. Rank window size constraint
3. Weighted RRF for asymmetric retriever confidence

### Derives-from

- decision-phase-2-recall-scoring-uses-rrf-with-dense-rank-tie-7969c37d
- reference-mnemonic-ranking-signals-inventory-all-scoring-for-27ae79dc
