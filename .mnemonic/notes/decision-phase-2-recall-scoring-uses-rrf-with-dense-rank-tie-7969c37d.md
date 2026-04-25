---
title: 'Decision: Phase 2 recall scoring uses RRF with dense rank tie handling'
tags:
  - recall
  - rrf
  - phase2
  - decision
  - workflow
lifecycle: permanent
createdAt: '2026-04-25T07:46:10.910Z'
updatedAt: '2026-04-25T07:46:31.502Z'
role: decision
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
# Decision: Phase 2 recall scoring uses RRF with dense rank tie handling

Phase 2 replaces additive hybrid lexical weighting with Reciprocal Rank Fusion (RRF) across semantic and lexical channels in recall ranking.

## Final decision

- RRF constant remains `K = 60`.
- Hybrid score uses semantic backbone plus scaled RRF contribution:
  - `hybrid = boosted + (1/(K+semanticRank) + 1/(K+lexicalRank)) * 3.5 + canonical * 0.005`
- `semanticRank` is assigned using dense ranking by semantic score (ties share rank).
- `lexicalRank` is assigned using dense ranking over lexical rank signal:
  - `lexical + coverage*0.3 + phrase*0.5`
- Deterministic tie-breaking for selection uses hybrid score, then boosted score, then lexical signal, then semantic score.

## Why

- RRF avoids raw-score calibration across heterogeneous channels.
- Dense tie handling preserves lexical reranking power when semantic scores tie.
- Canonical explanation remains a bounded nudge and does not displace direct factual answers.
- Fail-soft behavior remains: when ranks are missing, scoring falls back safely.

## Implementation scope

- `src/recall.ts` ranking logic and rank assignment
- `src/index.ts` rescue-candidate lexical ordering alignment
- `tests/recall.unit.test.ts` updated for RRF semantics

## Verification anchors

- Full test suite passed during phase closeout (`703/703`).
- Isolated dogfooding passed required checks after follow-up tuning.

## Related work commits

- `ba05b77` stabilize RRF tie handling and preserve direct-answer ranking
- `379c20c` sort lexical rescue candidates by lexical score
