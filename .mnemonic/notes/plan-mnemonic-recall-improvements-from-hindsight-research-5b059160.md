---
title: 'Plan: mnemonic Recall Improvements from Hindsight Research'
tags:
  - workflow
  - plan
  - embedding
  - recall
  - hindsight
lifecycle: temporary
createdAt: '2026-04-24T18:10:35.779Z'
updatedAt: '2026-04-25T12:01:27.949Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: research-hindsight-paper-analysis-for-mnemonic-recall-improv-2d9317b3
    type: follows
  - id: review-hindsight-plan-validation-against-design-principles-eae4ebe4
    type: derives-from
  - id: apply-phase-3-lexical-rescue-pre-tokenized-tf-idf-cache-inte-5d1512f7
    type: follows
  - id: plan-phase-4-temporal-retrieval-boost-implementation-87d668c6
    type: follows
  - id: summary-phase-4-temporal-retrieval-boost-completed-1e1ab210
    type: related-to
  - id: review-hindsight-master-plan-coverage-against-delivered-phas-62608b1b
    type: derives-from
  - id: plan-phase-5-temporal-parsing-with-confidence-gated-filterin-0f45f3cd
    type: follows
  - id: summary-performance-principles-compliance-audit-for-recall-p-b482b38b
    type: explains
memoryVersion: 1
---
# Plan: mnemonic Recall Improvements from Hindsight Research

## Research Source

`research-hindsight-paper-analysis-for-mnemonic-recall-improv-2d9317b3`

## Goal

Improve mnemonic's recall quality without discarding its core design: git-backed markdown, local Ollama embeddings, file-first storage, no databases or daemons.

## Scope

Focus on the TEMPR recall layer (retain/recall), not CARA (opinion/reflect), because mnemonic is a developer context store, not a conversational agent with disposition parameters.

---

## Phase Status Overview (current)

- [x] **Phase 1** Graph spreading activation in recall
- [x] **Phase 2** Reciprocal Rank Fusion (RRF)
- [x] **Phase 3** TF-IDF rescue precomputation optimization
- [x] **Phase 4** Temporal retrieval boost
- [x] **Phase 5** Temporal parsing + confidence-gated filtering

---

## Phase 1: Graph Spreading Activation in Recall (COMPLETED)

When semantic recall produces candidate notes, traverse related notes and boost scores via spreading activation over existing relationship graph.

### Phase 1 delivered

- Existing semantic candidates are score-boosted when connected to activated entry points.
- New graph-discovered candidates are introduced and flow through downstream ranking/promotion.
- Spreading uses bounded gating/decay/multipliers and remains fail-soft.

### Phase 1 evidence

- Implementation path: `applyGraphSpreadingActivation` in `src/recall.ts`.
- Phase request artifact: `phase-1-graph-spreading-activation-in-recall-b50cd362`.
- Phase 1 follow-up fix for discovery-only behavior was applied and verified.

---

## Phase 2: Reciprocal Rank Fusion (COMPLETED)

Replace additive lexical weighting with rank-based fusion over semantic and lexical channels.

### Phase 2 delivered

- Dense semantic and lexical rank assignment implemented.
- Hybrid score uses scaled RRF with bounded canonical term.
- Deterministic tie-breaking preserved.
- Advisory dogfood checks hardened post-implementation.

### Phase 2 evidence

- Implementation path: `computeHybridScore` and rank assignment in `src/recall.ts`.
- Decision artifact: `decision-phase-2-recall-scoring-uses-rrf-with-dense-rank-tie-7969c37d`.
- Summary artifact: `summary-phase-2-reciprocal-rank-fusion-completed-with-adviso-b5f823ef`.

---

## Phase 3: TF-IDF Rescue Precomputation Optimization (COMPLETED)

Original wording targeted a persistent per-vault BM25/IDF cache.

### Phase 3 delivered

- Implemented pre-tokenized TF-IDF corpus reuse for rescue ranking.
- Added session-cached projection token reuse keyed by `vaultPath::noteId`.
- Avoids repeated tokenization during lexical rescue in-session.

### Phase 3 delta vs original wording

- **Implemented adaptation:** session-scoped cache and prepared corpus reuse.
- **Not implemented:** persistent on-disk per-vault term-frequency index.
- This keeps architecture aligned with file-first/no-new-artifact constraints.

### Phase 3 evidence

- Implementation path: `collectLexicalRescueCandidates` in `src/index.ts`; token/corpus helpers in `src/cache.ts` and `src/lexical.ts`.
- Decision artifact: `decision-phase-3-lexical-rescue-uses-session-cached-projecti-6b5197fc`.
- Summary artifact: `summary-phase-3-lexical-rescue-pre-tokenized-tf-idf-cache-co-a492df41`.

---

## Phase 4: Temporal Retrieval Boost (COMPLETED)

Detect temporal cues in query text and adjust ranking by `updatedAt` recency.

### Phase 4 delivered

- Temporal cue hint detection added.
- Additive bounded recency boost applied to semantic and rescue candidates.
- Behavior is fail-soft and non-temporal queries are unchanged.

### Phase 4 delta vs original wording

- **Implemented:** temporal boost.
- **Not implemented in this phase:** strict temporal filtering.

### Phase 4 evidence

- Implementation path: `detectTemporalQueryHint` and `computeTemporalRecencyBoost` in `src/recall.ts`; boost integration in `src/index.ts`.
- Decision artifact: `decision-phase-4-recall-applies-additive-temporal-recency-bo-165fdbf3`.
- Summary artifact: `summary-phase-4-temporal-retrieval-boost-completed-1e1ab210`.

---

## Phase 5: Temporal Parsing + Confidence-Gated Filtering (COMPLETED)

Extend temporal handling with explicit-window parsing and strict filtering only when temporal intent confidence is high.

### Phase 5 delivered

- Added explicit relative-window parsing for numeric windows.
- Added temporal confidence model (`high`/`medium`/`low`).
- Added strict filtering only for high-confidence explicit windows.
- Preserved additive boost-only behavior for medium/low confidence hints.
- Applied same policy in semantic recall and lexical rescue paths.

### Phase 5 evidence

- Implementation paths: temporal parser + gating helpers in `src/recall.ts`; gated application in `src/index.ts`.
- Decision artifact: `decision-phase-5-applies-strict-temporal-filtering-only-for--63146f96`.
- Summary artifact: `summary-phase-5-temporal-parsing-and-confidence-gated-filter-bc395edc`.

---

## Deferred Items

**Cross-Encoder Reranking — Deferred:**
Blocked on Ollama cross-encoder model availability and runtime fit.

**Observation Synthesis — Deferred:**
Higher cost and unclear benefit for human-authored structured notes.

---

## Success Criteria Check

- [x] Each phase shipped independently and remains reversible
- [x] No new committed artifacts or databases introduced
- [x] Recall quality improved in dogfooding and benchmark-driven phases
- [x] No regression on existing test suites at each phase closeout
- [x] Language independence maintained by design constraints
- [x] Fail-soft behavior specified and preserved across phases

---

## Immediate Next Action

Hindsight plan phases are complete through Phase 5.

Choose next direction from deferred items:

- Cross-encoder reranking (if local model/runtime constraints are satisfied)
- Observation synthesis (if evidence supports cost/benefit)

Until then, continue dogfooding and regression validation on the completed recall stack.
