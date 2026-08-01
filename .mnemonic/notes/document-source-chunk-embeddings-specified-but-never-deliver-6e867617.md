---
title: >-
  Document-source chunk embeddings specified but never delivered
  (spec-vs-implementation gap)
tags:
  - attachments
  - document-source
  - retrieval
  - architecture
  - decision
  - bug
lifecycle: permanent
createdAt: '2026-08-01T20:35:12.274Z'
updatedAt: '2026-08-01T20:43:23.909Z'
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: document-source-attachment-five-bugs-found-and-fixed-via-pac-24bedd4b
    type: related-to
  - id: plan-deliver-document-source-chunk-semantic-retrieval-embedd-dba90b71
    type: derives-from
memoryVersion: 1
---
The canonical design note `document-source-attachments-design-delivery-and-verification-1517e52b` explicitly specified that document-source chunks be embedded, with lexical-only as the fail-soft fallback. Line 41: "embedding failures publish with lexical-only coverage" — a contract that only makes sense if embeddings are the primary path. Line 42 lists `embeddingCompatibilityIdentity` as part of the generation manifest, implying embeddings are produced and need a compatibility fingerprint for invalidation. Line 43 frames document chunks as full participants in recall ranking ("result diversity enforced after final scoring"), consistent with semantic+lexical hybrid fusion.

What shipped in 0.38.0 (PR #292, commit a8e3322) and remains today: document chunks are lexical-only. `buildGenerationFromFiles` (src/document-source-index.ts) never calls `embed()`, and `DocumentGeneration` (src/retrieval-document.ts) has no embeddings map — verified via `git log -S "embed(" -- src/document-source-index.ts src/document-sync.ts` (empty) and `git log -S "chunkEmbeddings|embeddings: Map" -- src/retrieval-document.ts` (empty). `collectDocumentChunkCandidates` (src/document-recall.ts) uses only `computeLexicalScore`; document results render in a trailing `## Document Results` section, never fused into the note RRF ranking. So lexical-only is not the fallback the spec described — it is the only path.

The scaffolding was laid as if to support the spec but the wiring never landed: `GenerationManifest.embeddingCompatibilityIdentity` exists but its value is just `${extractorId}::${extractorVersion}::${chunkerId}::${chunkerVersion}` (extractor+chunker, not the embedding model), so it cannot actually serve its named invalidation purpose. `DOCUMENT_SOURCE_LIMITS.maxEmbeddingWork = 10000` ("max chunks to embed per sync") is dead config — referenced only by a unit test asserting its numeric range, never by production code.

The gap was then rationalized as a feature. The five-bugs note `document-source-attachment-five-bugs-found-and-fixed-via-pac-24bedd4b` (Bug 2) says "the lexical-only document-source chunks even though they need no embeddings" — reframing lexical-only as the intended design, directly contradicting the canonical note. The canonical note was never corrected.

Downstream symptoms a user hit in 0.39.1 against the Platform attachment: a document containing MarkAsCompleted/MarkAsFailed/MarkAsCancelled was retrievable only with `minSimilarity: 1` (semantic suppressed), and in normal queries the `## Document Results` section truncated below memory results because chunks have no semantic vector to fuse into the main RRF ranking. Separately, heading text extraction dropped inline-code spans (e.g. `### \`MarkAsCompleted()\`` -> ""), compounding the lexical weakness.

Implication: this is an unimplemented spec, not "future work." The fail-soft contract and manifest scaffolding are already half in place, so the work to complete it is moderate: add a chunk-embedding map to DocumentGeneration, embed chunk projection text during syncDocumentSource (fail-soft, bounded by maxEmbeddingWork, reusing embed()/reindexEmbedConcurrency), make embeddingCompatibilityIdentity incorporate currentEmbeddingIdentity, fuse chunk cosine into the document-chunk score via RRF alongside the lexical composite, and decide chunk-embedding persistence (recompute per sync vs persist to disk keyed by chunkId+content hash). The biggest piece is persistence, since DocumentGeneration is in-memory and rebuilt from source bytes every sync.
