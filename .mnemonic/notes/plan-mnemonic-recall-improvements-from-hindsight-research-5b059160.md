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
updatedAt: '2026-04-25T10:33:46.117Z'
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
memoryVersion: 1
---
# Plan: mnemonic Recall Improvements from Hindsight Research

## Research Source

`research-hindsight-paper-analysis-for-mnemonic-recall-improv-2d9317b3`

## Goal

Improve mnemonic's recall quality without discarding its core design: git-backed markdown, local Ollama embeddings, file-first storage, no databases or daemons.

## Scope

Focus on the TEMPR recall layer (retain/recall), not CARA (opinion/reflect), because mnemonic is a developer context store, not a conversational agent with disposition parameters.

***

Phase 1: Graph Spreading Activation in Recall (REVIEW PENDING — v0.26.0)

Independent review found implementation is discovery-only, not true spreading activation. Existing candidates are never score-boosted by relationships. Fix before marking complete.

When semantic recall produces candidate notes, traverse their related notes and boost scores via spreading activation over existing relationship graph.

- **Status:** Implemented, tested, dogfood-validated
- **Tests:** 692 tests pass (10 new spreading tests added)
- **Dogfooding:** Ran against local build — hybrid recall, architecture notes, graph notes all surface correctly

## Phase 2: Reciprocal Rank Fusion (IN PROGRESS — Target: v0.26.0 or v0.27.0)

Replace additive hybrid scoring (`boosted + 0.12*lexical + 0.08*coverage + 0.16*phrase`) with RRF across semantic and lexical channels.

- Calibration-free: doesn't require tuning raw-score weights between different scoring systems
- Robust to missing items in one channel
- Items strong in BOTH channels naturally rise

1. After `applyLexicalReranking`, each candidate has:
   - `semanticRank` from initial dense retrieval
   - `lexicalRank` from reranked lexical scores
2. Compute `RRFScore = 1/(60 + semanticRank) + 1/(60 + lexicalRank)`
3. Add metadata/project boost as small additive post-RRF term (to preserve project priority)
4. Re-sort by RRFScore

**Open question — project boost interaction:** The existing +0.15 cosine similarity boost already influences `semanticRank`. Adding an additive post-RRF term risks double-counting project priority. Two options to test:

- **Option A (no additive term):** project-boosted semantic ranks already carry project priority into RRF; no post-RRF term needed
- **Option B (tiebreaker nudge):** small additive term (e.g., +0.001 per RRF point) as tiebreaker only

## Phase 3: Pre-computed BM25/IDF Cache (Target: v0.27.0)

Avoid re-tokenizing all notes on every TF-IDF rescue call by building a persistent per-vault term-frequency cache.

## Phase 4: Temporal Retrieval Boost (Target: v0.27.0 or v0.28.0)

Detect temporal cues in queries and boost/filter notes by `updatedAt`.

***

## Deferred Items

**Cross-Encoder Reranking — Deferred:**
Blocked on Ollama cross-encoder model availability.

**Observation Synthesis — Deferred:**
High cost, unclear benefit for human-authored structured notes.

***

## Success Criteria

- Each phase ships independently and is reversible
- No new committed artifacts or databases
- Recall quality improves on dogfooding benchmarks
- No regression on existing test suites
- Language independence maintained
- Every phase specifies explicit fail-soft behavior

***

## Immediate Next Action

Start Phase 2: implement Reciprocal Rank Fusion.
