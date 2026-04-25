---
title: Recall improvements from hindsight research (completed)
tags:
  - hindsight
  - recall
  - completed
  - design
  - plan
lifecycle: permanent
createdAt: '2026-04-25T21:44:35.524Z'
updatedAt: '2026-04-25T21:54:38.512Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: request-arxiv-2512-12818v1-embedding-research-for-mnemonic-6c0a8587
    type: follows
  - id: summary-performance-principles-compliance-audit-for-recall-p-b482b38b
    type: explains
  - id: hybrid-recall-design-and-implementation-0-20-0-0-23-0-350317a0
    type: related-to
  - id: apply-fix-finding-1-boost-existing-candidates-via-graph-spre-51fad28b
    type: derives-from
  - id: research-hindsight-paper-analysis-for-mnemonic-recall-improv-ae8fd9eb
    type: derives-from
  - id: phase-4-temporal-retrieval-boost-completed-e5a5dec8
    type: related-to
memoryVersion: 1
---
# Plan: mnemonic Recall Improvements from Hindsight Research

## Research Source

ArXiv 2512.12818v1 — Hindsight Memory Architecture analysis identified six improvement opportunities for mnemonic's recall pipeline, of which five were implemented in phases 1-5. See `research-hindsight-paper-analysis-for-mnemonic-recall-improv-ae8fd9eb` for the detailed gap analysis and "why" rationale.

### What mnemonic already had before this work

1. Semantic embeddings via `nomic-embed-text-v2-moe` through local Ollama
2. TF-IDF lexical rescue (scans all notes, ranks by TF-IDF cosine similarity)
3. Graph relationships (bidirectional typed: related-to, explains, example-of, supersedes, derives-from, follows)
4. Projection text for embedding (title, lifecycle, tags, summary, headings, max 1200 chars)
5. Temporal metadata (`updatedAt`, git-backed history with temporal interpretation)
6. Git-backed, markdown, embedding-driven core design
7. Language-independent structural signals

### What was implemented (phases 1-5)

1. **Phase 1 — Graph spreading activation** (COMPLETED): When semantic recall produces candidate notes, traverse related notes and boost scores via spreading activation over existing relationship graph.
2. **Phase 2 — Reciprocal Rank Fusion** (COMPLETED): Replace additive lexical weighting with rank-based fusion over semantic and lexical channels.
3. **Phase 3 — TF-IDF rescue precomputation** (COMPLETED): Session-scoped cache and pre-tokenized corpus reuse to avoid retokenizing all notes on every rescue call.
4. **Phase 4 — Temporal retrieval boost** (COMPLETED): Detect temporal cues in query text and adjust ranking by `updatedAt` recency.
5. **Phase 5 — Temporal parsing + confidence-gated filtering** (COMPLETED): Explicit relative-window parsing for numeric windows, temporal confidence model (high/medium/low), strict filtering only for high-confidence explicit windows.

### Implementation details per phase

- **Phase 1**: `applyGraphSpreadingActivation` in `src/recall.ts`. Follow-up fix: re-assign `semanticRank` after spreading so graph-discovered candidates get proper RRF contribution.
- **Phase 2**: `computeHybridScore` and rank assignment in `src/recall.ts`. Project boost reduced from 0.15 to 0.03 (tiebreaker). Canonical weight increased from 0.005 to 0.05.
- **Phase 3**: `collectLexicalRescueCandidates` in `src/index.ts`; token/corpus helpers in `src/cache.ts` and `src/lexical.ts`. Session-scoped cache instead of persistent per-vault index.
- **Phase 4**: `detectTemporalQueryHint` and `computeTemporalRecencyBoost` in `src/recall.ts`; boost integration in `src/index.ts`. Additive boost only, no strict filtering.
- **Phase 5**: Temporal parser + gating helpers in `src/recall.ts`; gated application in `src/index.ts`. Confidence model: high/medium/low. Strict filtering only for high-confidence explicit windows.

### What was deferred

- **Cross-encoder reranking**: Blocked on Ollama cross-encoder model availability
- **Observation/entity synthesis**: High cost, unclear benefit for human-authored structured notes

### Review findings (all addressed)

- **H1**: `semanticRank` re-assigned after graph spreading
- **H2**: Temporal filtering fails open on invalid dates
- **M5**: Project boost reduced to tiebreaker (0.03)
- **M8**: Rescue candidates compute lexical RRF even without semanticRank
- **M14**: Canonical weight increased to 0.05
- **M10**: Temporal hints reordered by specificity
- **M12**: Added `in the past` temporal pattern

### Design constraints preserved

- No database, daemon, or new committed artifacts
- Fail-soft to semantic-first behavior
- Additive, bounded, reversible
- Language-independent (English-only temporal hints deferred)
- One file per note
- No auto-relationship via LLM
- Similarity boost as tiebreaker, not hard filter
