---
title: 'Plan: read-only document-source attachment retrieval'
tags:
  - workflow
  - plan
  - attachments
  - markdown
  - architecture
  - retrieval
lifecycle: temporary
createdAt: '2026-07-28T08:08:25.305Z'
updatedAt: '2026-07-28T08:46:06.781Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: research-arbitrary-markdown-attachments-require-a-retrieval--2ab5f96c
    type: derives-from
  - id: review-narrow-markdown-attachments-to-read-only-retrieval-9655b010
    type: derives-from
  - id: review-document-source-attachment-plan-needs-revision-c113a0d5
    type: derives-from
memoryVersion: 1
---
Implement arbitrary Markdown repository attachments as a staged, read-only document retrieval feature after the public contracts are accepted.

The domain distinction is behavioral, not file-format based. A Mnemonic note is already Markdown with frontmatter. Therefore no `Note` gains a `markdown` type. Attachment configuration distinguishes a managed `mnemonic-vault` from a read-only `document-source`. Document representations use canonical IANA media types; the initial supported media type is `text/markdown`.

## Stage 1: contracts and configuration

- Make attachment configuration a normalized discriminated union:
  - `kind: "mnemonic-vault"` for managed Mnemonic notes; legacy configurations with no kind normalize to this branch.
  - `kind: "document-source"` with `acceptedMediaTypes: ["text/markdown"]` for arbitrary repository documents.
- Treat accepted media types as canonical, lower-case IANA media-type strings rather than a closed enum. Runtime validation checks the extractor registry and rejects unsupported types with an explicit error.
- Keep media-type parameters and character encoding separate from the base media type. The initial Markdown extractor reads UTF-8 source text.
- Allow a document source to accept multiple media types in the future, for example `text/markdown` and `application/pdf`, without adding another attachment kind.
- Add stable `attachmentId` distinct from `projectSlug` so one repository can host multiple attachment kinds or roots.
- Preserve existing Mnemonic attachment behavior unchanged.
- Document sources are always source-read-only. Reject `writable`, `pushBranch`, working-tree mode, and Mnemonic-only vault fields on this branch.
- Extend add/list/remove/enable/branch tools and schemas to address attachments by ID and report kind, accepted media types, and index state.
- Add compatibility, validation, identity, unsupported-media-type, and schema-contract tests.

Likely files: `src/vault.ts`, `src/config.ts`, attachment management tools, `src/structured-content.ts`, attachment config and schema tests.

## Stage 2: bounded Markdown document index

- Add internal `RetrievalDocument` and `RetrievalChunk` types without widening `NoteStorage` or adding a new Note variant.
- Enumerate tracked Markdown blobs from a pinned Git commit using recursive, NUL-safe Git output plus include/exclude/root rules.
- Detect each file's media type using bounded extension and content checks, then dispatch through a media-type extractor registry. Unknown or mismatched files fail soft with diagnostics.
- Record each document's canonical `mediaType`, source path, blob identity, byte size, and extraction metadata.
- Keep `extractorId`, `extractorVersion`, and `chunkerVersion` separate from `mediaType`; changing extraction or chunking behavior invalidates derived artifacts even when source bytes are unchanged.
- Parse Markdown with the existing MDAST stack, preserve heading ancestry, emit an introduction chunk, and split headingless or oversized sections by paragraph.
- Derive stable opaque chunk IDs from attachment ID, normalized path, heading ancestry, duplicate occurrence, and split ordinal; store content hashes separately.
- Preserve a stable document ID alongside each chunk ID so recall can retrieve the complete source document.
- Namespace document and chunk IDs separately from Memory IDs.
- Enforce limits for file count, bytes per file, chunks per document, and total chunks.
- Persist an atomic consumer-local manifest, projections, extracted text where needed, and embeddings; never write derived state to the source repository.
- Add tests for nested files, duplicate headings, code fences, headingless documents, oversized sections, stable IDs, media detection, extractor-version invalidation, bounds, failures, and zero source-repository writes.

Recommended new files: `src/retrieval-document.ts`, `src/document-extractor.ts`, `src/markdown-extractor.ts`, `src/markdown-chunker.ts`, `src/document-source-index.ts`.

## Stage 3: explicit sync reconciliation

- Fetch and resolve an exact remote-tracking commit rather than assuming a local branch advances.
- Compare commit/blob/content fingerprints plus extractor and chunker versions with the last complete manifest.
- Rebuild only changed/new/invalidated chunks, remove deleted projections and embeddings, and preserve the previous complete snapshot on failure.
- Make `force` rebuild the full document index.
- Invalidate retrieval caches after successful reconciliation.
- Report indexed commit, media-type counts, document/chunk counts, additions/updates/deletions, embeddings, failures, and stale state.
- Add unit and integration tests for add/change/delete, extractor upgrades, provider failure, partial failure, cache invalidation, and structured sync output.

Likely files: `src/tools/sync.ts`, new index store and extractor registry, cache helpers, sync and staleness tests.

## Stage 4: mixed default recall

- Add a narrow discriminated retrieval candidate boundary: `memory` adapts the existing Note/Vault path; `document-chunk` uses the derived document index.
- Merge document semantic and lexical candidates into the existing bounded ranking while excluding graph, canonical-memory, role, lifecycle, relationship, confidence, and temporal boosts.
- Apply project scope and per-document diversity caps.
- Extend human-readable and structured recall results with a required kind, chunk ID, document ID, source path, heading ancestry, excerpt, attachment identity, source media type, extraction metadata, and indexed revision.
- Keep existing memory result fields and behavior compatible.
- Exclude document chunks for tag/lifecycle filters and temporal/workflow modes in the MVP.
- Test mixed ranking, citations, excerpts, scope/filter/mode behavior, failure isolation, schema parsing, text rendering, and absence from mutation paths and project memory summaries.

Likely files: `src/tools/recall.ts`, `src/tools/recall-helpers.ts`, `src/recall.ts`, `src/structured-content.ts`, recall/schema/rendering tests.

## Stage 5: exact document retrieval and mutation boundaries

- Extend `get` so a document ID returned by recall retrieves the complete source representation from the same pinned indexed revision.
- For `text/markdown`, return the exact source Markdown with `sourceMediaType: "text/markdown"` and `contentMediaType: "text/markdown"`.
- Keep source representation separate from extracted representation. A future binary type such as `application/pdf` may return extracted text through `get` while exposing source metadata or a separate resource mechanism for raw bytes; do not mislabel extracted text as PDF content.
- Return a discriminated `document` result containing attachment identity, repository-relative path, indexed revision, source media type, returned content media type, extraction metadata when applicable, and content.
- Keep chunk lookup distinct: a chunk hit points to its parent document ID; callers use the document ID when full context is needed.
- Add explicit response-size handling. Return full text content when within the configured bound; for oversized documents, return a clear bounded response with document size and guidance rather than silently truncating or exhausting the MCP context.
- Preserve existing memory `get` behavior and response fields unchanged.
- Centralize the mutation boundary: `update`, `forget`, `move_memory`, `relate`, `unrelate`, and `consolidate` accept managed memory IDs only. If passed a document or chunk ID, return an explicit read-only external-document error rather than `not found`.
- Tool descriptions and structured results must never suggest that a retrieved document can be updated through Mnemonic.
- Test mixed memory/document requests, exact revision consistency, deleted or stale documents, duplicate paths across attachments, source-versus-content media types, schema parsing, text rendering, size-limit behavior, and explicit rejection by every mutation path.

Likely files: `src/tools/get.ts`, mutation guard/helpers and mutating tools, `src/structured-content.ts`, the document index store, get integration tests, mutation-error tests, and MCP schema snapshots.

## Deferred

- Additional extractors such as PDF and HTML.
- Raw binary document delivery through MCP resources.
- `list`, recent memories, project summary, memory graph, relationships, consolidation of document content, workflow recall, temporal recall, and write-through document editing.

## Documentation and verification

- Update `ARCHITECTURE.md`, `AGENT.md`, `README.md`, `docs/index.html`, and `CHANGELOG.md` as stages land.
- At each stage run typecheck, targeted tests, full tests, lint, Slopwatch, and isolated MCP dogfooding.
- Do not start implementation until the public contracts are accepted: document results are non-memory content; attachment identity is separate from repository slug; document sources are retrievable through `get` but immutable through Mnemonic; media types describe source representation while extractors and returned content representation are versioned separately.
