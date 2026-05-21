---
title: Hindsight research recall improvements — plan and analysis (consolidated)
tags:
  - hindsight
  - recall
  - completed
  - design
lifecycle: permanent
createdAt: '2026-05-21T21:17:30.201Z'
updatedAt: '2026-05-21T21:17:30.201Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: summary-performance-principles-compliance-audit-for-recall-p-b482b38b
    type: explains
  - id: hybrid-recall-design-and-implementation-0-20-0-0-23-0-350317a0
    type: related-to
memoryVersion: 1
---
# Hindsight Research Recall Improvements — Plan and Analysis (Consolidated)

## Research Source

ArXiv 2512.12818v1 — Hindsight Memory Architecture: TEMPR (Temporal Entity Memory Priming Retrieval) with four-way parallel retrieval (semantic, BM25 keyword, graph spreading activation, temporal), merged via Reciprocal Rank Fusion (RRF), refined by neural cross-encoder reranker, filtered by token budget.

## What Mnemonic Already Had

1. Semantic embeddings via Ollama + `nomic-embed-text-v2-moe`
2. TF-IDF lexical rescue (scans all notes, ranks by cosine similarity)
3. Graph relationships (bidirectional typed: related-to, explains, example-of, supersedes, derives-from, follows)
4. Projection text for embedding (title, lifecycle, tags, summary, headings, max 1200 chars)
5. Temporal metadata (`updatedAt`, git-backed history with temporal interpretation)
6. Git-backed, markdown, embedding-driven core design
7. Language-independent structural signals

## What Was Implemented (Phases 1-5)

**Phase 1 — Graph Spreading Activation**: When semantic recall produces candidates, traverse related notes and boost scores via spreading activation. `applyGraphSpreadingActivation` in `src/recall.ts`. Fix: re-assign `semanticRank` after spreading so graph-discovered candidates get proper RRF contribution.

**Phase 2 — Reciprocal Rank Fusion**: Replace additive hybrid scoring with RRF (`RRF(f) = Σ 1/(k + rank_R(f))`, k≈60). Project boost reduced from +0.15 to +0.03 (tiebreaker). Canonical weight increased from 0.005 to 0.05.

**Phase 3 — TF-IDF Rescue Precomputation**: Session-scoped cache + pre-tokenized corpus reuse in `src/cache.ts` and `src/lexical.ts` to avoid retokenizing all notes on every rescue call.

**Phase 4 — Temporal Retrieval Boost**: Detect temporal cues in queries (`recent`, `last week`, date patterns), boost by `updatedAt` recency. Additive only, no strict filtering.

**Phase 5 — Confidence-Gated Temporal Filtering**: Explicit relative-window parsing. Confidence model: high/medium/low. Strict filtering only for high-confidence explicit windows. Fail-soft on invalid dates.

## What Was Deferred

- Cross-encoder reranking — blocked on Ollama cross-encoder model availability
- Observation/entity synthesis — high cost, unclear benefit for human-authored structured notes
- Token budget filtering — fixed `limit` parameter instead of dynamic budget
- English-only temporal hints remain deferred (M6)

## Design Constraints Preserved

- No database, daemon, or new committed artifacts
- Fail-soft to semantic-first behavior
- Additive, bounded, reversible
- Language-independent (temporal hints: English-only deferred)
- One file per note, no auto-relationship via LLM
- Similarity boost as tiebreaker, not hard filter
