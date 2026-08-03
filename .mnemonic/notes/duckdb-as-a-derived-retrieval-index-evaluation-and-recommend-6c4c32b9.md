---
title: DuckDB as a derived retrieval index — evaluation and recommendation
tags:
  - retrieval
  - embeddings
  - architecture
  - ollama
  - migration
  - hybrid-search
  - document-source
lifecycle: permanent
createdAt: '2026-08-03T10:42:54.827Z'
updatedAt: '2026-08-03T10:44:07.153Z'
role: research
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mnemonic-key-design-decisions-3f2a6273
    type: related-to
memoryVersion: 1
---
DuckDB is compatible with mnemonic only as a **disposable retrieval projection**. It must not become the system of record.

Recommended direction:

1. Keep Markdown/YAML notes, `relatedTo` relationships, Git history, attachment configuration, and document-source files authoritative.
2. If measurements justify it, introduce DuckDB behind a feature flag as an optional **per-vault FTS/BM25 index**.
3. Keep semantic embedding generation with the existing provider abstraction. DuckDB does not generate embeddings.
4. Keep exact cosine ranking and hybrid fusion in TypeScript initially.
5. Defer DuckDB VSS/HNSW until measurements show exact vector scans are a bottleneck.
6. Never use one global authoritative DuckDB file.

The strongest potential use case is persistent lexical indexing for larger document-source attachments. A wholesale retrieval rewrite is not justified yet.

## Non-negotiable invariants

These remain authoritative and human-readable:

- Notes as one Markdown file per memory with YAML frontmatter
- Relationship metadata such as `relatedTo`
- Git history, temporal reconstruction, and source branches
- Main/global and project-vault boundaries
- Writable/read-only mnemonic-vault attachment configuration
- External document-source files
- Embedding provider/model/dimension configuration

DuckDB may contain only derived retrieval data and pointers back to sources. Deleting every DuckDB file must lose no user-owned information.

Recovery must preserve this invariant:

> Delete the generated index, run `sync`, and return to a fully operational state.

If recovery requires manually repairing SQL state or recovering information that exists only in DuckDB, the design has failed.

## Current retrieval architecture

Mnemonic currently has separate note and document-chunk retrieval paths.

### Lexical ranking

`src/lexical.ts` implements stateless in-process lexical scoring:

- weighted substring, bigram-Jaccard, and unigram-Jaccard scoring
- smoothed inverse document frequency
- TF-IDF cosine similarity
- coverage and title signals
- bounded lexical candidate and rescue thresholds

`src/tools/recall-helpers.ts` builds per-vault candidate pools from session-cached notes and projections. It reuses cached projection tokens, prepares the TF-IDF corpus, ranks candidates, and applies small project, attachment, and document-chunk priors.

### Semantic ranking and fusion

`src/tools/recall.ts` orchestrates query embedding, vault search order, missing-embedding backfill, per-vault exact cosine scans, projection loading, lexical reranking, graph spreading activation, related-vault discovery, an always-on lexical channel, canonical-explanation promotion, final selection, and document-chunk fusion.

`src/recall.ts` owns reciprocal-rank-fusion behavior, including `RRF_K = 60`. DuckDB could execute RRF in SQL, but it would not remove mnemonic-specific fusion such as scope priors, graph expansion, canonical promotion, stable tie-breaking, and result selection.

### Embeddings and regeneration

`src/embeddings.ts` provides Ollama, OpenAI-compatible, OpenAI, and Gemini embedding transports. Compatibility includes provider, model, dimensions, metric, and optional input mode.

Note embeddings and projections are local derived files. `sync { force: true }` regenerates them. Deletes remove derived embedding/projection state. Model/provider compatibility changes trigger regeneration rather than making derived data authoritative.

Document-source chunk embeddings are persisted independently per attachment with content hashes and compatibility metadata. `src/document-sync.ts`, `src/chunk-embedding-storage.ts`, and `src/generation-storage.ts` manage compatibility invalidation, content reuse, stale sweeps, and process-local generations.

### Scope and attachment boundaries

`src/vault.ts` distinguishes main/global vaults, project vaults, attached mnemonic vaults, and attached document sources.

Attached mnemonic vaults can be writable or read-only and may be read through Git objects at a configured branch. Their embeddings stay in local derived storage rather than being written into the attached branch.

Document-source attachments are read-only external files with independent include/exclude/media configuration and per-attachment generated state. These boundaries should remain the DuckDB isolation boundaries.

## Relevant DuckDB capabilities

### FTS/BM25

DuckDB's official `fts` extension provides Okapi BM25 through `match_bm25`, with stemming, stopwords, multiple text fields, and configurable `k`/`b` values. It could replace mnemonic's corpus-level TF-IDF channel with a standard inverted index and scorer.

Important limitation: DuckDB FTS indexes do **not** automatically update when the source table changes. They must be dropped/recreated or overwritten. This favors a batched `sync` lifecycle rather than rebuilding after every individual memory mutation.

### Vector storage and VSS

DuckDB can store embeddings in fixed-size `FLOAT[]` columns. The official `vss` extension provides HNSW indexes for L2, cosine, and inner-product distance.

VSS remains experimental:

- persistent HNSW requires an experimental flag
- WAL recovery for custom indexes is incomplete
- crashes may corrupt the derived index
- checkpoints serialize the complete index
- the index is loaded into and must fit in memory
- deletes mark entries until compaction/rebuild
- ANN search introduces recall tradeoffs

These limitations are tolerable only when the database is disposable, but they do not establish a benefit over exact cosine scans at personal-memory scale.

### Embedding generation

DuckDB core does not generate text embeddings. Adopting it does not remove Ollama or another provider.

Community extensions can call providers or bundle selected models, but add platform, maturity, privacy, and packaging risks. Some simply call Ollama from inside DuckDB, moving the integration point without removing the dependency.

Eliminating Ollama requires a separate inference decision, such as an embedded ONNX/runtime-backed model. Do not conflate this with the retrieval-store decision.

### Hybrid search and RRF

DuckDB does not provide mnemonic's complete hybrid-ranking pipeline natively. RRF is straightforward in SQL CTEs or macros, but mnemonic still owns domain-specific ranking semantics.

Keep RRF and graph/domain ranking in TypeScript initially. Moving fusion into SQL increases coupling without a demonstrated productivity or quality gain.

### Runtime, onboarding, and concurrency

The Node client is `@duckdb/node-api`, introducing native/platform-specific binaries.

FTS/VSS extensions can autoload/download on first use. That regresses offline onboarding and hermetic CI unless extension binaries are packaged or explicitly installed for each supported DuckDB version/platform.

DuckDB supports multiple writers within one process, but multiple processes cannot normally write the same file concurrently. Mnemonic may have multiple MCP server processes, so writes must be serialized or isolated. Per-vault/per-attachment files reduce the blast radius but do not entirely remove the concern.

## Proposed derived-index layout

Use one disposable database per authority/isolation boundary, co-located with existing generated state:

```text
~/mnemonic-vault/
  notes/                           # authoritative
  .mnemonic/
    retrieval.duckdb               # disposable main-vault index

<project>/
  .mnemonic/
    retrieval.duckdb               # disposable project-vault index

<attachment-cache>/
  mnemonic-vault/<attachment-id>/
    retrieval.duckdb

  document-source/<attachment-id>/
    retrieval.duckdb
```

Do not create one global file containing every project and attachment. It would regress project portability, per-vault regeneration, independent attachment deletion, read-only attachment semantics, failure isolation, write concurrency, and Git-ref-specific indexing.

Recall should query relevant per-vault indexes and fuse results in mnemonic, preserving scope and provenance behavior.

## Suggested derived schema

Rows should retain enough identity to validate staleness and map results to canonical files:

```text
source_id
vault_id
attachment_id
source_kind            # note or document-chunk
logical_path
memory_id
document_id
chunk_id
git_ref
git_commit
content_hash
chunk_start/chunk_end
heading_ancestry
projection_text
embedding
embedding_provider
embedding_model
embedding_dimensions
embedding_metric
projection_version
extractor_version
chunker_version
index_schema_version
```

Relationships may be copied as a derived acceleration structure, but authority remains YAML/Markdown. Git remains authoritative for history and temporal reconstruction.

## Options considered

### A. Keep the current implementation

Advantages: no native dependency, inspectable generated files, no extension installation, no database locking, exact semantic ranking, and direct alignment with file-first architecture.

Choose this if measurements show lexical preparation and cosine scans are not meaningful bottlenecks.

### B. Optional per-vault FTS/BM25 index — recommended experiment

Keep current embeddings and exact vector scans. Add optional DuckDB FTS built from projection text.

Advantages:

- standard BM25 lexical ranking
- persistent lexical index
- likely strongest benefit for large document sources
- metadata filtering in SQL
- bounded and reversible adoption

Costs:

- native Node dependency
- extension packaging/offline work
- FTS rebuild lifecycle
- database process locking

This is the best-aligned first experiment.

### C. Full per-vault retrieval database

Move projections and vectors into DuckDB and use FTS plus exact or HNSW search. Potential benefits include transactional deletes and consolidation of generated files. However, this requires reimplementing compatibility/version invalidation, makes debugging less transparent, and introduces HNSW lifecycle risks. Consider only after Option B demonstrates durable value.

### D. One global DuckDB

Rejected because it conflicts with isolation, portability, attachment, recovery, and concurrency requirements.

## Benefits

- standard BM25 instead of custom corpus TF-IDF
- potentially lower lexical latency for large corpora
- persistent document-source lexical indexes across restarts
- filtering by vault, attachment, source type, commit, and metadata
- transactional update/delete behavior
- easier diagnostic and analytics queries
- no permanent database service
- possible later consolidation of derived projections and embeddings

## Drawbacks and risks

- native `@duckdb/node-api` dependency
- platform-specific distribution and upgrades
- extension installation and caching
- first-run network access unless extensions are packaged
- harder hermetic/offline CI
- FTS indexes do not incrementally maintain themselves
- concurrent multi-process writers are unsupported
- SQL schema/version migrations replace simple file operations
- corruption is less manually inspectable than broken JSON
- VSS persistence is experimental
- ANN can reduce retrieval recall
- DuckDB does not remove provider privacy or availability concerns
- substantial effort may produce little benefit at current corpus sizes

## Rebuild and publication lifecycle

A full rebuild should:

1. Open a temporary per-vault database.
2. Read canonical Markdown or attached Git/source files.
3. Recompute deterministic projections.
4. Reuse or regenerate embeddings according to compatibility identity.
5. Insert derived rows with source hashes and version identities.
6. Recreate FTS indexes after the corpus is complete.
7. Optionally build a vector index only when enabled.
8. Validate counts and representative lookups.
9. Checkpoint and close the database.
10. Atomically rename it into place.

An interrupted rebuild must leave the previous index usable. `sync { force: true }` should rebuild all generated retrieval state. Ordinary `sync` should reconcile stale rows using source IDs, hashes, commits, and schema/embedding compatibility.

## Staged migration plan

### Stage 0 — measure

Record corpus size and recall p50/p95, separating projection loading, tokenization/corpus preparation, TF-IDF ranking, exact cosine scan, document generation loading, and provider latency.

Establish representative retrieval-quality fixtures covering semantic, exact-term, relation, project/global, attachment, temporal, and document-source queries. If performance is adequate, stop.

### Stage 1 — optional FTS proof of concept

- feature flag, default off
- per-vault/per-attachment databases
- projection text as indexed content
- `sync`-driven rebuild
- existing TF-IDF remains fallback
- semantic ranking and RRF remain unchanged
- hermetic CI uses explicitly available extension binaries

### Stage 2 — document-source persistence

Prioritize document sources because they are larger and benefit most from persistent lexical retrieval. Preserve content-hash reuse, extractor/chunker/schema versions, stale sweeps, attachment-local deletion, and fail-soft lexical coverage.

### Stage 3 — optional vector storage without HNSW

If reducing derived-file counts has operational value, store embeddings in DuckDB but continue exact cosine ranking. This gains transactional storage without approximate-index behavior.

### Stage 4 — VSS only when measured

Enable HNSW only if exact cosine is a demonstrated bottleneck. Keep it optional and disposable, and benchmark recall loss as well as speed.

## Acceptance and rollback criteria

Ship Stage 1 only if:

- recall p95 improves materially, or persistent/offline lexical behavior fills an important gap
- ranking quality is equal or better on a fixed evaluation set
- `delete generated index -> sync` completely recovers
- Markdown, relationships, Git, and source files remain authoritative
- CI and offline onboarding do not depend on dynamic downloads
- concurrent MCP processes cannot corrupt generated state
- per-vault and per-attachment deletion remains independent
- disabling the feature restores the existing path

Reject or roll back if corruption recovery requires more than delete and sync, FTS rebuild cost harms writes/sync, native packaging complicates installation materially, multi-process locking causes failures, ranking parity cannot be maintained, or a database begins accumulating cross-vault authority.

## Final recommendation

Do not adopt DuckDB as mnemonic's database of record or as a blanket replacement for TF-IDF, RRF, embeddings, and Ollama.

Run a measured, optional **per-vault FTS/BM25 proof of concept**, with document-source attachments as the likely highest-value target. Keep canonical data in Markdown/Git, fusion and graph semantics in mnemonic, exact vector search initially, and evaluate embedding inference independently.

```text
Markdown/YAML + Git          authoritative
Relations in Markdown        authoritative
Source documents             authoritative
DuckDB FTS/BM25              optional disposable projection
DuckDB vector storage        possible later
Exact cosine search          keep initially
HNSW/VSS                     defer pending evidence
Embedding generation         separate provider concern
Fusion and graph logic       keep in mnemonic
```

## Research references

- FTS extension: <https://duckdb.org/docs/current/core_extensions/full_text_search>
- FTS guide and rebuild behavior: <https://duckdb.org/docs/current/guides/sql_features/full_text_search>
- VSS extension: <https://duckdb.org/docs/current/core_extensions/vss>
- VSS announcement: <https://duckdb.org/2024/05/03/vector-similarity-search-vss>
- Node Neo client: <https://duckdb.org/docs/current/clients/node_neo/overview>
- Extension installation: <https://duckdb.org/docs/current/extensions/installing_extensions>
- Advanced/offline installation: <https://duckdb.org/docs/current/extensions/advanced_installation_methods>
- Concurrency: <https://duckdb.org/docs/current/connect/concurrency>

Detailed evaluation artifacts were generated under `.pi-subagents/artifacts/outputs/683181c7-2dab-4816-83a2-a4a0b530d036/duckdb-eval/`.
