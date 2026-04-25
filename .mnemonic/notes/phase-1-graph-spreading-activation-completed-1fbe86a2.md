---
title: Phase 1 graph spreading activation (completed)
tags:
  - hindsight
  - recall
  - phase-1
  - completed
lifecycle: permanent
createdAt: '2026-04-25T21:43:08.351Z'
updatedAt: '2026-04-25T21:43:08.351Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: apply-fix-finding-1-boost-existing-candidates-via-graph-spre-51fad28b
    type: related-to
memoryVersion: 1
---
Phase 1 implemented graph spreading activation in recall.

- Existing semantic candidates are score-boosted when connected to activated entry points.
- New graph-discovered candidates are introduced and flow through downstream ranking/promotion.
- Spreading uses bounded gating/decay/multipliers and remains fail-soft.
- Follow-up fix: re-assign `semanticRank` after graph spreading so graph-discovered candidates get proper RRF contribution.

Implementation: `applyGraphSpreadingActivation` in `src/recall.ts`.
