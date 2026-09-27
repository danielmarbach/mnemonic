---
title: 'Document-source attachments: design, plan, delivery, and verification'
tags:
  - attachments
  - document-source
  - markdown
  - retrieval
  - architecture
  - decision
  - plan
  - embeddings
lifecycle: permanent
createdAt: '2026-09-27T20:54:37.471Z'
updatedAt: '2026-09-27T20:54:37.471Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: docs-gap-fixed-attachment-configuration-documented-in-readme-93c55f0d
    type: related-to
  - id: document-source-chunk-embeddings-specified-but-never-deliver-6e867617
    type: explains
  - id: document-source-chunk-embeddings-specified-but-never-deliver-6e867617
    type: derives-from
memoryVersion: 1
---
## Consolidated from:
### Document-source attachments: design, delivery, and verification (canonical)
*Source: `document-source-attachments-design-delivery-and-verification-1517e52b`*

Consolidates the completed document-source attachment workflow (request, research, two design reviews, six-stage plan, stage review) into one permanent canonical note. Source notes are deleted; durable detail remains in the related permanent notes.

Canonical outcome of the request → research → plan → review workflow for the document-source attachment feature. Shipped in 0.38.0 as PR #292 (commit a8e3322, "Read-only document-source attachment retrieval"). Supersedes the six temporary workflow notes; durable detail lives in the related permanent notes.

## Decision

- Keep `Attachment` as the user-facing federation concept; add `kind: "document-source"` for immutable external repository documents, alongside `kind: "mnemonic-vault"` for managed notes.
- Do NOT model document sources as `Vault`/`NoteStorage`, do not persist synthetic notes, and do not widen `NoteStorage`. Documents are consumer-local derived retrieval artifacts, not memories.
- Read-only by contract: mnemonic never writes to the source repository. Mutation tools reject `doc:`/`chunk:` references with an immutable-document error.
- Explicit `sync` indexes a pinned remote-tracking commit; recall never triggers repository-wide indexing.
- MVP supports `text/markdown` only; extractor contracts remain extensible (PDF/HTML deferred).

## Architecture contracts

- Discriminated union attachment config (`mnemonic-vault` | `document-source`) with a persisted opaque `attachmentId` separate from repository identity (`projectSlug`), so one repository can host multiple attachment kinds or roots. Legacy configs normalize to `mnemonic-vault`; deterministic legacy IDs keep old config readable until the persisted-ID migration.
- Document-source scope: `root` (repository-relative POSIX path, default `.`; absolute paths and `..` rejected), `include` (globs relative to root, default `["**/*.md"]`), `exclude` (defaults cover generated/vendor paths: node_modules, .git, dist, build, .next, .cache, coverage), `acceptedMediaTypes` (canonical lower-case IANA base media types, default `["text/markdown"]`). Only tracked git blobs are indexed; symlinks, submodules, and untracked files are skipped; matching is case-sensitive; bare-name globs match any segment. Kind-mismatched fields are ignored.
- Identity: `documentId` = attachment + normalized root-relative path; `chunkId` = document + heading ancestry + duplicate-heading occurrence + split ordinal. The `doc:`/`chunk:` namespaces cannot parse as Memory IDs. A central entity resolver distinguishes managed memory, read-only attached memory, writable attached memory, document, chunk, and unknown refs.
- Atomic generations: per-attachment generation directories built in temp space, manifest-validated, then published via a current-generation pointer swap. Readers pin one generation for the whole request. Previous generation retained; unpinned evicted handles return `snapshot-evicted`, never newer content. Cache invalidation happens only after successful publication. Per-file failures skip with diagnostics; embedding failures publish with lexical-only coverage.
- Extraction metadata includes `extractorId`/`extractorVersion`/options hash, `chunkerId`/`chunkerVersion`/options hash, projection and index schema versions, and embedding compatibility identity. Representation names: `sourceMediaType`, `extractedContentMediaType`, `chunkContentMediaType`, `excerptContentMediaType`, `contentMediaType`.
- Recall: document-chunk candidates participate in project/all default scope only (excluded from global scope, tag/lifecycle filters, temporal and workflow modes). Per-document chunk cap of 5 before the rank window; result diversity enforced after final scoring. Each result carries stable `documentId`/`chunkId`, a revision-qualified retrieval handle, source path, heading ancestry, excerpt, attachment identity, source media type, indexed revision, and generation ID.
- `get`: resolves revision-qualified `doc:`/`chunk:` handles to exact content from the pinned generation (for text/markdown, exact source text). Mixed calls return an ordered discriminated `items` array plus `documents` and per-item `itemErrors`, retaining legacy `notes`/`notFound` fields; `count` = resolved items. Full responses over the size bound return `content-too-large`, never silent truncation.
- Mutation rejection is centralized (`mutation-guard.ts`): `update`, `forget`, `move_memory`, `relate`, `unrelate`, and `consolidate` reject document-source entities and return distinct errors for immutable documents vs read-only attached vs writable attached vs unknown refs.

## Delivery and verification

- All six plan stages landed: config/migration, document model + extraction/chunking, atomic generations + exact retrieval, mutation rejection, explicit sync/reconciliation, and mixed recall activation.
- Stage review: 248 non-git tests green (133 new + 115 existing fast tests); typecheck and lint clean. Post-merge dogfooding (Pack D) found five additional end-to-end defects, all fixed; full suite 1305 green, Pack D 12/12.
- Known MVP scope: PDF/HTML extractors, raw binary delivery via MCP resources, document browsing through list/recent-memories/project-summary/graph, temporal/workflow document recall, write-through document editing — all deferred.

## Related

- `document-source-attachment-five-bugs-found-and-fixed-via-pac-24bedd4b` — post-merge dogfood bugs and fixes.
- `pack-d-document-source-attachment-dogfood-pack-and-a-b-c-con-4f75a70c` — reusable dogfood pack and A/B/C consolidation hardening.
- `docs-gap-fixed-attachment-configuration-documented-in-readme-93c55f0d` — documentation gap and fix (README + homepage).

### Plan: deliver document-source chunk semantic retrieval (embeddings + persistence + RRF fusion)
*Source: `plan-deliver-document-source-chunk-semantic-retrieval-embedd-dba90b71`*

Plan to deliver the document-source chunk semantic retrieval that the canonical design note (`document-source-attachments-design-delivery-and-verification-1517e52b`) specified but never shipped (see `document-source-chunk-embeddings-specified-but-never-deliver-6e867617`). Today document chunks are lexical-only and render in a trailing `## Document Results` section never fused into the note RRF ranking. This plan makes embeddings the primary channel with lexical as the fail-soft fallback (the spec's line-41 contract), fuses chunks into the unified ranking below notes, and persists chunk embeddings to disk for cheap re-syncs.

## Decisions (resolved)

- **No privacy settings gate.** Embedding provider is env-configured; local Ollama is the privacy-preserving default. Document-source attachments add one sentence to the existing embedding-privacy docs: attaching an external repo sends its chunk content to the configured embedding provider — use a local provider or don't attach if content is restricted. Privacy-oriented users use Ollama or don't attach; no per-attachment toggle, no new config field.
- **Recency, not popularity, for embedding-cap selection.** Popularity has no signal at index time (no query log, no view counts). Recency is git-native: compute per-path last-modified commit in one `git log --name-only --format=%H <indexedCommit>` pass, sort each document's chunks by lastModCommit descending, tie-break by source path. Key nuance: with Option B content-hash reuse, recency is only the selection priority for which still-unembedded chunks to embed this sync — NOT a progress cursor — so re-syncs never get stuck re-embedding recently-touched chunks; content-hash reuse handles incrementality. Ship plain recency first; a later tuning follow-up may add a small boost for top-level/overview chunks (heading ancestry depth ≤ 2) so stable-but-important core docs aren't starved.
- **Option B persistence (similar to notes).** Per-attachment subdirectory under the project vault's already-gitignored `.mnemonic/embeddings/` (the project already centralizes all project embeddings there; `Storage` already accepts `embeddingsDirOverride`, used by submodule vaults). New lightweight `ChunkEmbeddingStorage` mirrors `Storage`'s embedding file IO but is keyed by string chunk IDs (slugged via `normalizePathToSlug`) — deliberately NOT forced through the `MemoryId` branded type, since chunk IDs aren't memory IDs (honors the codebase's make-invalid-states-unrepresentable principle). Reuses the `EmbeddingRecord` on-disk shape. Content hash stored per record so re-syncs reuse unchanged vectors and only embed new/changed chunks. Per-attachment staleness sweep on sync mirrors `removeStaleEmbeddings` (delete files whose chunkId isn't in the current generation). `remove-attachment` deletes the whole `.mnemonic/embeddings/doc-source/<attachmentId>/` dir.
- **Document chunks rank below notes (resolves Fix D).** Chunks fuse into the unified recall ranking — not a trailing appendix — with a prior smaller than `ATTACHMENT_BOOST` (which is already smaller than `PROJECT_SCOPE_BOOST`). Net effect: project/main vault notes always rank above document chunks unless a document is a dramatically stronger semantic+lexical match. No truncation risk; the spec's "document chunks participate in recall ranking" (line 43) becomes true. Retire the `## Document Results` section.

## Stages

- [ ] **Stage 1 — Data model + storage.** Add `chunkEmbeddings: Map<ChunkId, EmbeddingRecord>` to `DocumentGeneration` (`src/retrieval-document.ts`). Add `embeddedChunkCount` and `embeddingFailures: Array<{ chunkId: string; reason: string }>` to `GenerationManifest`. Make `embeddingCompatibilityIdentity` incorporate `currentEmbeddingIdentity` (provider+model+dimensions+metric) so the existing `isGenerationCurrent` check triggers a full re-embed on model change. Bump `indexSchemaVersion` ("1" → "2"). Implement `ChunkEmbeddingStorage` (string chunk IDs, content-hash field) pointed at `.mnemonic/embeddings/doc-source/<attachmentId>/`.
- [ ] **Stage 2 — Embed on sync (fail-soft, bounded, recency-priority, content-hash reuse).** New `embedGenerationChunks(gen, ctx, attachmentId)` step in `syncDocumentSource` (keep `buildGenerationFromFiles` pure). Embed each chunk's projection text = content + headingAncestry + sourcePath (reuse `joinHeadingAncestry`/enrichment). Reuse `ctx.config.reindexEmbedConcurrency` workers and `attempt("embed:chunk", …)` per chunk. Respect `DOCUMENT_SOURCE_LIMITS.maxEmbeddingWork` (finally wire the dead constant). Recency-priority selection of un-embedded chunks when cap bites. Reuse on-disk embeddings whose content hash + embedding identity match. Fail-soft: if embedding unavailable (Ollama down/quota), publish with `chunkEmbeddings` empty and `embeddingFailures` populated — lexical-only coverage, exactly the spec contract; do NOT fail the sync. Per-attachment staleness sweep after publish.
- [ ] **Stage 4 — Recall fusion.** In `collectDocumentChunkCandidates` (`src/document-recall.ts`), embed the query once (already fail-soft via `attempt` in `recall.ts`), compute `safeCosineSimilarity(queryVec, chunkEmbedding)` for chunks with embeddings, fuse with the lexical composite using the note path's RRF primitives (`RRF_K`, dense ranks, `computeHybridScore`-style). When `queryVec` is null, keep lexical composite only. Expose `semanticScore`/`lexicalScore` split on `DocumentChunkRecallResult` for diagnostics (mirrors `RetrievalEvidence.scoreDecomposition`).
- [ ] **Stage 5 — Unified ranking.** Fuse document chunks into the unified ranked list in `src/tools/recall.ts` with a prior < `ATTACHMENT_BOOST` so notes outrank them by default. Retire the trailing `## Document Results` section. Guarantee documents are visible (rank just below notes by default).
- [ ] **Stage 6 — Verify + docs.** Unit: embed-during-sync with a fake provider, fail-soft when embedding unavailable (publishes lexical-only generation), `maxEmbeddingWork` cap, `embeddingCompatibilityIdentity` model-change invalidation, content-hash reuse, staleness sweep, `remove-attachment` cleanup. Integration: extend `tests/document-source.integration.test.ts` — semantic recall surfaces a chunk lexical-only misses; query-embedding-failure still returns lexical chunks; re-index on chunker/embedding-version bump via `isGenerationCurrent`. Dogfood: re-run `scripts/dogfood-document-source.mjs` (Pack D) and the real Platform attachment repro (MarkAsCompleted/MarkAsFailed/MarkAsCancelled with a NORMAL minSimilarity). Docs: add the one-sentence privacy note.

## Constraints

- No database, daemon, synced index in the source repo, or breaking default output shape. Reuse existing `embed()`, `currentEmbeddingIdentity`, `checkEmbeddingCompatibility`, `EmbeddingRecord`, `reindexEmbedConcurrency`, `removeStaleEmbeddings` pattern, `embeddingsDirOverride` mechanism. DocumentGeneration stays in-memory; chunk embeddings persist to disk separately.
- Determinism: recency tie-break by source path; RRF ties by chunkId (mirror the note path's stable note-id tie-breaker).
- Privacy: external providers receive chunk content — documented, not gated.

## Open follow-ups (not blocking)

- Recency tuning boost for top-level/overview chunks.
- `sync` structured output currently omits document-source results (text-only) — minor gap noted in the five-bugs note; fold in `embeddedChunkCount`/`embeddingFailures` while adding structured doc-source results.
- Lazy backfill on recall for chunks whose on-disk embedding is missing (mirror `embedMissingNotes` pre-recall) — decide after measuring cold-start latency.

## Self-check

Every stage is executable and maps to a concrete file/contract. No placeholders. The spec's fail-soft contract (line 41) is the acceptance gate: embedding failures publish with lexical-only coverage and recall never throws. Fresh adversarial review (typescript-code-review skill) is the final gate before merge.
