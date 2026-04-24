---
title: 'Request: Phase 2 Reciprocal Rank Fusion in Recall'
tags:
  - workflow
  - request
  - recall
  - rrf
  - phase2
lifecycle: temporary
createdAt: '2026-04-24T23:09:30.973Z'
updatedAt: '2026-04-24T23:09:30.973Z'
role: context
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
# Request: Phase 2 Reciprocal Rank Fusion in Recall

Implement Phase 2 from the mnemonic Recall Improvements plan.

## Goal

Replace additive hybrid scoring with Reciprocal Rank Fusion (RRF) across semantic and lexical channels to improve recall quality without requiring calibration between scoring systems.

## Background

Current scoring uses additive weights:

```typescript
boosted + 0.12*lexical + 0.08*coverage + 0.16*phrase + canonical
```

This requires tuning raw-score weights between incompatible systems (cosine similarity vs Jaccard). RRF is calibration-free and naturally robust to missing items in one channel.

## Scope (from plan)

- Remove additive `LEXICAL_HYBRID_WEIGHT`, `COVERAGE_HYBRID_WEIGHT`, `PHRASE_HYBRID_WEIGHT`
- Add `RRF_K = 60` constant
- After `applyLexicalReranking`, each candidate has:
  - `semanticRank` from initial dense retrieval ordering
  - `lexicalRank` from reranked lexical scores
- Compute `RRFScore = 1/(60 + semanticRank) + 1/(60 + lexicalRank)`
- Re-sort by RRF score
- Preserve fail-soft: if lexical data is missing, candidate still ranks via semantic channel alone
- Project boost interaction: existing +0.15 cosine boost influences semantic rank; no additional post-RRF additive term (Option A)

## Success criteria

- Items strong in BOTH semantic and lexical channels naturally rise
- Calibration-free: no weight tuning between scoring systems
- Robust to missing lexical scores (undefined lexicalScore still produces valid RRF via semantic-only)
- No regression on existing recall test suite (703+ tests)
- Typecheck passes
- Dogfooding: hybrid recall queries still work
- Language independence maintained
