---
title: Phase 2 RRF ranking (completed)
tags:
  - hindsight
  - recall
  - phase-2
  - completed
lifecycle: permanent
createdAt: '2026-04-25T21:43:24.549Z'
updatedAt: '2026-04-25T21:43:24.549Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: apply-pack-a-advisory-follow-up-by-hardening-dogfood-heurist-5d41bfae
    type: derives-from
  - id: hybrid-recall-design-and-implementation-0-20-0-0-23-0-350317a0
    type: related-to
  - id: apply-pack-a-advisory-follow-up-by-hardening-dogfood-heurist-5d41bfae
    type: follows
  - id: review-pack-a-advisory-follow-up-verification-clean-c03c2fd3
    type: derives-from
  - id: decision-phase-2-recall-scoring-uses-rrf-with-dense-rank-tie-7969c37d
    type: derives-from
  - id: rpir-workflow-design-for-mnemonic-research-plan-implement-re-80b00851
    type: example-of
  - id: decision-phase-2-recall-scoring-uses-rrf-with-dense-rank-tie-7969c37d
    type: explains
  - id: reference-mnemonic-rpi-workflow-skill-improvement-opportunit-1b944a63
    type: derives-from
memoryVersion: 1
---
Phase 2 replaced additive lexical scoring with Reciprocal Rank Fusion (RRF).

- Dense semantic and lexical rank assignment implemented.
- Hybrid score uses scaled RRF with bounded canonical term.
- Deterministic tie-breaking preserved.
- Project boost reduced from 0.15 to 0.03 (tiebreaker nudge, not dominant weighting).
- Canonical hybrid weight increased from 0.005 to 0.05.
- Review findings addressed: RRF stability verified, canonical weight tuned.

Decision: `decision-phase-2-recall-scoring-uses-rrf-with-dense-rank-tie-7969c37d`
Implementation: `computeHybridScore` and rank assignment in `src/recall.ts`.
