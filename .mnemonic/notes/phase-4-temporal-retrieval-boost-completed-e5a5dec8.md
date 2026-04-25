---
title: Phase 4 temporal retrieval boost (completed)
tags:
  - hindsight
  - recall
  - phase-4
  - completed
lifecycle: permanent
createdAt: '2026-04-25T21:43:36.049Z'
updatedAt: '2026-04-25T21:43:36.049Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: plan-mnemonic-recall-improvements-from-hindsight-research-5b059160
    type: follows
memoryVersion: 1
---
Phase 4 implemented temporal retrieval boost for recall.

- Temporal cue hint detection added.
- Additive bounded recency boost applied to semantic and rescue candidates.
- Behavior is fail-soft: non-temporal queries are unchanged.
- Scopes delta vs original plan: additive boost only, no strict filtering.

Decision: `decision-phase-4-recall-applies-additive-temporal-recency-bo-165fdbf3`
Implementation: `detectTemporalQueryHint` and `computeTemporalRecencyBoost` in `src/recall.ts`; boost integration in `src/index.ts`.
