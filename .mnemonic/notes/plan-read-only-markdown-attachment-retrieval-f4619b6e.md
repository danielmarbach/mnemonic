---
title: 'Plan: read-only Markdown attachment retrieval'
tags:
  - workflow
  - plan
  - attachments
  - markdown
  - architecture
  - retrieval
lifecycle: temporary
createdAt: '2026-07-28T08:08:25.305Z'
updatedAt: '2026-07-28T08:26:59.567Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: research-arbitrary-markdown-attachments-require-a-retrieval--2ab5f96c
    type: derives-from
  - id: review-narrow-markdown-attachments-to-read-only-retrieval-9655b010
    type: derives-from
memoryVersion: 1
---
Implement arbitrary Markdown repository attachments as a staged, read-only retrieval feature after the two open product contracts are accepted.

## Stage 1: contracts and configuration

- Add a normalized attachment discriminant: legacy or omitted kind means `mnemonic`; new kind is `markdown`.
- Add stable `attachmentId` distinct from `projectSlug` so one repository can host multiple attachment kinds or roots.
- Preserve existing Mnemonic attachment behavior unchanged.
- Reject Markdown combinations with `writable`, `pushBranch`, working-tree mode, or Mnemonic-only vault fields.
- Extend add/list/remove/enable/branch tools and schemas to address attachments by ID and report kind/index state.
- Add compatibility, validation, identity, and schema-contract tests.

Likely files: `src/vault.ts`, `src/config.ts`, attachment management tools, `src/structured-content.ts`, attachment config and schema tests.

## Stage 2: bounded Markdown index

- Add internal `RetrievalDocument` and `RetrievalChunk` types without widening `NoteStorage`.
- Enumerate tracked Markdown blobs from a pinned Git commit using recursive, NUL-safe Git output plus include/exclude/root rules.
- Parse with the existing MDAST stack, preserve heading ancestry, emit an introduction chunk, and split headingless or oversized sections by paragraph.
- Derive stable opaque chunk IDs from attachment ID, normalized path, heading ancestry, duplicate occurrence, and split ordinal; store content hashes separately.
- Preserve a stable document ID alongside each chunk ID so recall can retrieve the complete source document.
- Enforce limits for file count, bytes per file, chunks per document, and total chunks.
- Persist an atomic consumer-local manifest, projections, and embeddings; never write derived state to the source repository.
- Add tests for nested files, duplicate headings, code fences, headingless documents, oversized sections, stable IDs, bounds, failures, and zero source-repository writes.

Recommended new files: `src/retrieval-document.ts`, `src/markdown-chunker.ts`, `src/markdown-attachment-index.ts`.

## Stage 3: explicit sync reconciliation

- Fetch and resolve an exact remote-tracking commit rather than assuming a local branch advances.
- Compare commit/blob/content fingerprints with the last complete manifest.
- Rebuild only changed/new chunks, remove deleted projections and embeddings, and preserve the previous complete snapshot on failure.
- Make `force` rebuild the full Markdown index.
- Invalidate retrieval caches after successful reconciliation.
- Report indexed commit, document/chunk counts, additions/updates/deletions, embeddings, failures, and stale state.
- Add unit and integration tests for add/change/delete, provider failure, partial failure, cache invalidation, and structured sync output.

Likely files: `src/tools/sync.ts`, new index store, cache helpers, sync and staleness tests.

## Stage 4: mixed default recall

- Add a narrow discriminated retrieval candidate boundary: `memory` adapts the existing Note/Vault path; `markdown-chunk` uses the derived index.
- Merge Markdown semantic and lexical candidates into the existing bounded ranking while excluding graph, canonical-memory, role, lifecycle, relationship, confidence, and temporal boosts.
- Apply project scope and per-document diversity caps.
- Extend human-readable and structured recall results with a required kind, chunk ID, document ID, source path, heading ancestry, excerpt, attachment identity, and indexed revision.
- Keep existing memory result fields and behavior compatible.
- Exclude Markdown chunks for tag/lifecycle filters and temporal/workflow modes in the MVP.
- Test mixed ranking, citations, excerpts, scope/filter/mode behavior, failure isolation, schema parsing, text rendering, and absence from mutation paths and project memory summaries.

Likely files: `src/tools/recall.ts`, `src/tools/recall-helpers.ts`, `src/recall.ts`, `src/structured-content.ts`, recall/schema/rendering tests.

## Stage 5: exact Markdown document retrieval

- Extend `get` so a Markdown `documentId` returned by recall retrieves the complete source file from the same pinned indexed revision.
- Return a discriminated `markdown-document` result containing attachment identity, repository-relative path, indexed revision, media type, and full Markdown content rather than fabricating Note metadata.
- Keep chunk lookup distinct: a chunk hit points to its parent document ID; callers use the document ID when full context is needed.
- Add explicit response-size handling. Return full content when within the configured bound; for oversized documents, return a clear bounded response with document size and guidance rather than silently truncating or exhausting the MCP context.
- Preserve existing memory `get` behavior and response fields unchanged.
- Test mixed memory/document requests, exact revision consistency, deleted or stale documents, duplicate paths across attachments, schema parsing, text rendering, and size-limit behavior.

Likely files: `src/tools/get.ts`, `src/structured-content.ts`, the Markdown index store, get integration tests, and MCP schema snapshots.

## Deferred

- `list`, recent memories, project summary, memory graph, relationships, consolidation, workflow recall, temporal recall, and write-through Markdown editing.

## Documentation and verification

- Update `ARCHITECTURE.md`, `AGENT.md`, `README.md`, `docs/index.html`, and `CHANGELOG.md` as stages land.
- At each stage run typecheck, targeted tests, full tests, lint, Slopwatch, and isolated MCP dogfooding.
- Do not start implementation until the two product contracts in the upstream research note are explicitly accepted.
