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
updatedAt: '2026-04-24T18:10:41.367Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: research-hindsight-paper-analysis-for-mnemonic-recall-improv-2d9317b3
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

---

## Phase 1: Graph Spreading Activation in Recall (Target: v0.24.0)

**Phase-1 What:** When semantic recall produces candidate notes, traverse their related notes and boost scores via spreading activation over existing relationship graph.

**Phase-1 Why:**

- Existing graph is currently underutilized in recall — only shown in post-hoc relationship previews
- Multi-hop discovery: a note about "InMemory transport" may not match "broker simulation", but if they're related, spreading activation can bridge that gap
- Aligns with Hindsight's graph retrieval channel

**Phase-1 How:**

1. After semantic scoring, take top-N candidates as entry points
2. For each entry point, traverse 1-hop `note.relatedTo` relationships
3. Propagate a reduced activation score to related notes not already in the candidate set
4. Add discovered notes as new candidates with the propagated score
5. Continue to applyLexicalReranking and applyCanonicalExplanationPromotion as usual

**Parameters:**

- Entry point limit: top 5 semantic candidates
- Max hops: 1 (conservative; 2 hops risks noise in small corpora)
- Hop decay factor: 0.5 (entry score * 0.5 for direct relation)
- Relationship type multipliers (optional): `explains`/`derives-from` = 1.0, `related-to` = 0.8
- Activation gating: only propagate if entry point semantic score >= 0.5 (avoid weak seeds)

**Phase-1 Validation:**

- Add tests: spreading activation discovers a related note that pure semantic misses
- Dogfooding: query "broker simulation design" should surface `InMemory transport simulation design` even if exact terms don't align semantically
- Ensure no regression on existing recall benchmarks

---

## Phase 2: Reciprocal Rank Fusion (Target: v0.24.0 or v0.25.0)

**Phase-2 What:** Replace additive hybrid scoring (`boosted + 0.12*lexical + 0.08*coverage + 0.16*phrase`) with RRF across semantic and lexical channels.

**Phase-2 Why:**

- Calibration-free: doesn't require tuning raw-score weights between different scoring systems
- Robust to missing items in one channel
- Items strong in BOTH channels naturally rise

**Phase-2 How:**

1. After `applyLexicalReranking`, each candidate has:
   - `semanticRank` from initial dense retrieval
   - `lexicalRank` from reranked lexical scores
2. Compute `RRFScore = 1/(60 + semanticRank) + 1/(60 + lexicalRank)`
3. Add metadata/project boost as small additive post-RRF term (to preserve project priority)
4. Re-sort by RRFScore

**Phase-2 Validation:**

- Regression test: ensure existing high-confidence semantic matches still win
- Query with rare terms: verify lexical matches rise appropriately
- Compare MRR on dogfooding benchmark before/after

---

## Phase 3: Pre-computed BM25/IDF Cache (Target: v0.25.0)

**Phase-3 What:** Avoid re-tokenizing all notes on every TF-IDF rescue call by building a persistent per-vault term-frequency cache.

**Phase-3 Why:**

- Current `rankDocumentsByTfIdf` tokenizes the entire rescue pool on every recall
- For large vaults (100+ notes), this adds unnecessary latency
- Hindsight uses GIN-indexed BM25; we can't assume a database but can cache derived stats

**Phase-3 How:**

1. Store `.mnemonic/lexical-cache.json` alongside vault (gitignored, derived-only)
2. Cache structure: `{ terms: { "term": { df: number, postings: [{noteId, tf}] } }, lastUpdated: "iso", noteCount: number }`
3. Invalidate when note count changes or on explicit `reindex`
4. `rankDocumentsByTfIdf` uses cache when available, falls back to current behavior when stale

**Phase-3 Validation:**

- Timing: measure rescue path latency before/after on a realistic vault
- Correctness: ensure cached scores match uncached scores exactly
- Cache invalidation: verify stale cache is rebuilt on note additions/deletions

---

## Phase 4: Temporal Retrieval Boost (Target: v0.25.0 or v0.26.0)

**Phase-4 What:** Detect temporal cues in queries and boost/filter notes by `updatedAt`.

**Phase-4 Why:**

- Hindsight's temporal channel handles explicit and relative date expressions
- mnemonic already stores `updatedAt` and has temporal interpretation for history
- Common query pattern: "recent decisions", "what changed last week", "latest findings"

**Phase-4 How:**

1. Detect temporal keywords: "recent", "last", "this week", "yesterday", "2025", "March"
2. Parse into approximate date range (e.g., "recent" → last 30 days)
3. Compute temporal boost: `exp(-|note.updatedAt - rangeCenter| / σ)` where σ is range/2
4. Apply as additive boost alongside semantic score (smaller weight, e.g., +0.05 max)
5. Fail-soft: if temporal parsing is uncertain, skip boost entirely

**Phase-4 Validation:**

- Query "recent embedding decisions" should boost the hybrid-recall-design note
- Verify non-temporal queries are unaffected

---

## Deferred Items

**Cross-Encoder Reranking — Deferred:**
Blocked on Ollama cross-encoder support verification. If Ollama cannot serve cross-encoder models (ms-marco-MiniLM-L-6-v2), this conflicts with local-first design. Revisit after Ollama feature support is confirmed.

**Observation Synthesis — Deferred:**
High cost, unclear benefit for human-authored structured notes. Revisit if mnemonic ingests raw unstructured streams (e.g., conversation logs).

---

## Success Criteria

- Each phase ships independently and is reversible
- No new committed artifacts or databases
- Recall quality improves on dogfooding benchmarks
- No regression on existing test suites
- Language independence maintained

---

## Immediate Next Action

Start Phase 1: implement graph spreading activation in recall with tests.
