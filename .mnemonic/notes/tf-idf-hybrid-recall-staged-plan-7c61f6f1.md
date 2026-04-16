---
title: TF-IDF hybrid recall staged plan
tags:
  - recall
  - hybrid-search
  - plan
  - implementation
  - projections
lifecycle: temporary
createdAt: '2026-04-16T19:32:34.302Z'
updatedAt: '2026-04-16T19:34:39.571Z'
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Refine the TF-IDF experiment as a staged implementation and verification plan that can be executed without changing mnemonic's file-first, semantic-first architecture.

## Goal

Determine whether TF-IDF materially improves the lexical lane of hybrid recall enough to justify keeping it, while preserving the current retrieval contract:

- semantic recall remains primary
- project-first widening remains intact
- derived data stays rebuildable and disposable
- local MCP usage requires no new operational steps

## Baseline and scope

The baseline is the current shipped hybrid recall implementation described in `Hybrid recall design and implementation (completed 0.20.0)`.

The experiment must stay inside the existing retrieval architecture:

- source data remains markdown notes
- projection text remains the lexical substrate
- embeddings remain the primary recall path
- TF-IDF is evaluated only as a helper inside the lexical lane

Do not widen scope into persistence, background indexing, raw-markdown parsing, or user-visible configuration until the retrieval value is proven.

## Likely code areas

- `src/lexical.ts`
  Extend lexical helpers with TF, IDF, vector scoring, candidate lookup, and deterministic ranking utilities while preserving the current normalization story where practical.
- `src/recall.ts`
  Gate when TF-IDF participates, preserve semantic-first reranking boundaries, and keep project-biased widening behavior unchanged.
- `src/index.ts`
  Only touch if the current rescue path orchestration lives here and needs a narrower insertion point for TF-IDF candidate collection.
- `tests/lexical.unit.test.ts`
  Add deterministic scoring, token weighting, and candidate lookup coverage.
- `tests/recall.unit.test.ts` and `tests/recall-embeddings.integration.test.ts`
  Add regression coverage for paraphrase safety, lexical-heavy wins, and project-biased recall invariants.
- `tests/helpers/mcp.ts` or existing MCP smoke coverage
  Reuse the normal local entrypoint to prove cold-start simplicity remains unchanged.

## Phase 1 — Rescue-only TF-IDF prototype

### Phase 1 objective and implementation shape

- Build the index from projection text already loaded for the request or retrievable through the existing derived-data path.
- Keep the index request-scoped or otherwise ephemeral in-memory only.
- Reuse existing normalization and tokenization behavior where possible so old and new lexical signals remain comparable.
- Restrict TF-IDF to rescue mode only; strong semantic results should not route through TF-IDF-first ranking.
- Fail soft to the current shipped behavior if TF-IDF construction or scoring fails.

### Phase 1 acceptance criteria

1. No architectural drift

- no database
- no daemon or warm sidecar
- no committed or synced TF-IDF artifacts
- full rebuild possible from local derived retrieval text

1. No semantic-first regression

- paraphrase queries that currently succeed still rank the semantic match first
- project-biased widening stays unchanged
- TF-IDF does not become the primary ranker for already-strong semantic results

1. Better lexical rescue quality

- exact identifiers, note titles, repo jargon, and other rare lexical queries produce equal or better top candidates than the current rescue path
- fewer fuzzy but irrelevant rescue results appear on these queries

1. Acceptable performance

- index build cost is small enough for local dogfooding and tests
- rescue query time is no worse than the current rescue path on realistic fixture corpora
- memory overhead remains modest and clearly MCP-friendly

### Phase 1 verification scenarios

A. Semantic paraphrase stays dominant

- Query with conceptually matching language that does not share strong lexical overlap.
- Expected: semantic match still wins; TF-IDF does not displace it.

B. Exact repo jargon improves

- Query with rare feature names, identifiers, note ids, or implementation vocabulary.
- Expected: rescue candidates are more precise than the current heuristic path.

C. Project bias remains correct

- Query against both project-local and global matching notes.
- Expected: project notes still fill first, then global notes widen in only as needed.

D. Weak semantic fallback improves

- Use intentionally noisy or low-similarity queries.
- Expected: TF-IDF surfaces plausible lexical candidates that the current rescue misses or ranks poorly.

E. Cold-start simplicity is preserved

- Start the server through the existing local helper and run recall normally.
- Expected: no prebuild step, no extra service, no new operator behavior.

### Phase 1 smoke tests

- unit tests for TF, IDF, cosine or equivalent vector scoring, and inverted-index candidate lookup
- deterministic ranking tests for fixed documents and queries
- integration tests comparing current rescue behavior against TF-IDF rescue on a fixed fixture corpus
- MCP smoke test through the real entrypoint proving recall works without extra runtime setup

### Phase 1 exit criteria

Continue only if all are true:

- semantic paraphrase behavior is unchanged or clearly not worse
- lexical-heavy rescue quality improves enough to justify the added logic
- no operational burden is introduced
- local performance cost stays acceptable

Otherwise stop and keep the current design.

## Phase 2 — TF-IDF candidate generation for hybrid mode

### Phase 2 objective and implementation shape

- Keep semantic recall and project-biased widening exactly as today.
- Use TF-IDF only to reduce lexical work or improve lexical candidate precision before final scoring.
- Preserve the explainable ranking model: semantic first, lexical assists, project bias preserved.
- Avoid adding persistent caches or lifecycle management complexity just to support this phase.

### Phase 2 acceptance criteria

1. Hybrid quality is same or better than both current and rescue-only modes.
2. Candidate generation reduces lexical scoring work or end-to-end recall time on larger corpora.
3. Mixed project-plus-global queries still surface the right blend of local and global notes.
4. Synonym-heavy or paraphrase-heavy queries still rely on semantic ranking rather than exact-token dependence.

### Phase 2 verification scenarios

F. Large mixed corpus scaling check

- Compare current hybrid mode, rescue-only TF-IDF, and candidate-generation TF-IDF on a larger fixture set.
- Expected: same or better top-k relevance with reduced lexical work or neutral-to-better latency.

G. Project plus global blend

- Query where the best answer spans a project-local note and a useful global note.
- Expected: project note remains preferred while useful global memory still appears.

H. No exact-token dependence regression

- Query with synonyms or paraphrases that share little lexical overlap.
- Expected: semantic-first behavior still wins.

### Phase 2 smoke tests

- benchmark-style test over a synthetic larger fixture corpus
- integration tests covering mixed semantic and lexical query suites
- regression tests asserting project-first widening behavior remains unchanged

### Phase 2 exit criteria

Adopt TF-IDF candidate generation only if:

- retrieval quality is equal or better than both the current design and rescue-only TF-IDF
- candidate scoring cost or recall latency measurably improves on larger corpora
- the implementation stays simple, testable, and file-first
- the feature still feels like a small derived helper rather than a new subsystem

Otherwise keep rescue-only TF-IDF or drop the experiment entirely.

## Decision matrix

### Keep current design

Choose this if:

- TF-IDF does not clearly improve lexical-heavy recall
- paraphrase quality regresses
- complexity rises more than the measured benefit justifies

### Keep rescue-only TF-IDF

Choose this if:

- lexical-heavy queries improve
- paraphrase safety holds
- candidate-generation gains are weak or inconclusive

### Adopt candidate-generation TF-IDF

Choose this only if:

- Phase 1 already shows strong rescue-only value
- larger-corpus verification shows clear cost or latency wins
- semantic-first behavior and project bias remain intact
- the implementation still matches mnemonic's architectural guardrails

## Consolidation stance

No consolidation is needed with the shipped hybrid recall memory right now. That note remains the canonical record of the current production design. This note is a forward-looking experiment plan and is intentionally temporary until the experiment is either executed and consolidated into a durable result or dropped.
