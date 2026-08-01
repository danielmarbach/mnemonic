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
updatedAt: '2026-08-01T09:25:44.019Z'
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
  - id: review-read-only-markdown-attachment-retrieval-all-6-stages--e6d2d533
    type: derives-from
  - id: document-source-attachment-five-bugs-found-and-fixed-via-pac-24bedd4b
    type: follows
  - id: docs-gap-fixed-attachment-configuration-documented-in-readme-93c55f0d
    type: related-to
memoryVersion: 1
---
Implement repository-backed, read-only document retrieval as a staged extension of attachments. The MVP supports `text/markdown`, while the contracts remain extensible to formats such as PDF without treating external documents as Mnemonic notes.

The domain distinction is behavioral, not file-format based. A Mnemonic `Note` is managed memory stored as Markdown with frontmatter. A `document-source` exposes immutable external documents. No `Note` gains a `markdown` type, and document identifiers never become Memory IDs.

The public feature remains disabled until configuration, indexing, exact retrieval, mutation rejection, sync publication, and recall integration are all available together.

## Stage 1: attachment contracts, migration, and source scope

- Make attachment configuration a normalized discriminated union:
  - `kind: "mnemonic-vault"` for managed Mnemonic notes. Legacy configurations with no kind normalize to this branch.
  - `kind: "document-source"` for immutable repository documents.
- Give every attachment a persisted opaque `attachmentId`, separate from repository identity (`projectSlug`).
- Add an explicit migration that persists IDs for legacy attachments. Until migration, derive the same deterministic legacy ID from project association, repository slug, and normalized vault folder so old configuration remains readable.
- New attachments receive a generated persistent ID. Changing local path, branch, enabled state, or source filters does not change it.
- Continue accepting `projectSlug` in existing remove/enable/branch tool calls when it resolves to exactly one attachment. Return a deprecation hint plus the resolved `attachmentId`. Once multiple attachments share a repository slug, reject slug-only selection with an ambiguity error listing attachment IDs.
- Always return both `attachmentId` and repository identity from attachment tools.
- Define document-source scope in configuration:
  - `root`: normalized repository-relative POSIX path, default `.`; reject absolute paths, `..`, and paths outside the repository.
  - `include`: non-empty documented glob list relative to `root`; default `**/*.md` for the initial Markdown source.
  - `exclude`: documented glob list relative to `root`; define deterministic defaults for generated/vendor paths.
  - Matching is case-sensitive against Git tree paths on every platform.
  - Enumerate tracked Git blobs only. Skip symlinks, submodules, directories, and untracked working-tree files.
- Define accepted representations as a non-empty, open array of canonical lower-case IANA base media-type strings: initially `acceptedMediaTypes: ["text/markdown"]`.
- Validate media-type syntax, reject parameters in the base field, deduplicate values, and keep character encoding separate. The initial Markdown extractor accepts UTF-8.
- Current binaries reject newly submitted unsupported media types. When an older binary reads configuration written by a newer version, preserve unsupported values, expose `unsupported-media-type` status, and never drop or rewrite them during unrelated config updates. Enable/index only supported values; fail explicitly if none are supported.
- Preserve writable `mnemonic-vault` behavior unchanged. Forbid `vaultFolder`, `writable`, `pushBranch`, and working-tree mode only on `document-source`.
- Branch `add_attachment` validation and attachment loading immediately by kind. Document sources must not require `.mnemonic/notes`, instantiate `Vault`/`AttachedStorage`, initialize storage inside the source repository, or edit its `.gitignore`.

Likely files: `src/vault.ts`, `src/config.ts`, `src/migration.ts`, attachment management tools, attachment-loading helpers, `src/structured-content.ts`, configuration/migration/schema tests.

## Stage 2: document model, extraction, chunking, and identity

- Add internal `RetrievalDocument`, `RetrievalChunk`, `DocumentGeneration`, and extractor contracts without widening `NoteStorage` or adding a Note variant.
- Use a media-type extractor registry. Detect source representation using bounded extension and content checks, validate it against `acceptedMediaTypes`, and dispatch to a registered extractor. Unknown or mismatched blobs fail soft with diagnostics.
- Use representation names consistently:
  - `sourceMediaType` describes source bytes, such as `text/markdown`.
  - `extractedContentMediaType` describes extractor output used for chunking.
  - `chunkContentMediaType` and `excerptContentMediaType` describe derived text.
  - `contentMediaType` describes content returned by `get`.
- Record source path, blob OID, byte size, source media type, encoding, and extraction metadata per document.
- Include complete invalidation identity in the manifest: `extractorId`, `extractorVersion`, extractor options hash, `chunkerId`, `chunkerVersion`, chunker options hash, projection schema version, index schema version, and existing embedding compatibility identity.
- Parse Markdown with the existing MDAST stack. Preserve heading ancestry, emit an introduction chunk, and split headingless or oversized sections by paragraph with deterministic bounds.
- Define stable logical identities:
  - `documentId` derives from attachment ID plus normalized root-relative path. A rename is documented as delete/add.
  - `chunkId` derives from document ID plus heading ancestry, duplicate-heading occurrence, and split ordinal.
  - Source/content hashes detect changes but are not logical identity.
- Define parseable namespaces that cannot match the current Memory ID grammar. Use reserved delimiters such as `doc:` and `chunk:` and update relevant input schemas to recognize these entity references explicitly.
- Add a central entity resolver that distinguishes managed memory, read-only attached Mnemonic memory, writable attached Mnemonic memory, document, chunk, and genuinely unknown IDs.
- Enforce limits for tracked files, bytes per file, extracted text, chunks per document, total chunks, and embedding work.

Recommended new files: `src/retrieval-document.ts`, `src/document-entity-ref.ts`, `src/document-extractor.ts`, `src/markdown-extractor.ts`, `src/markdown-chunker.ts`, `src/document-source-index.ts`, and focused unit tests.

## Stage 3: atomic generations and exact retrieval contracts

- Store consumer-local derived state under per-attachment generation directories. Never depend on mutable source working-tree files for retrieval.
- Build each generation in a temporary directory, validate its manifest and identities, then atomically publish it by replacing a small current-generation pointer. Readers capture one generation at request start and use it for the entire request.
- Cache invalidation occurs only after successful publication.
- Define failure policy:
  - Repository/ref/enumeration failures, manifest corruption, identity collisions, and publication failures are fatal for that attachment generation; retain the previous generation.
  - Unsupported, oversized, malformed, or extractor-failed individual files are skipped with bounded diagnostics.
  - Embedding failures preserve coherent document/chunk artifacts and publish with explicit lexical-only coverage diagnostics, matching Mnemonic's fail-soft embedding behavior.
  - If the first build fails fatally, expose `index-unavailable` and contribute no document candidates.
  - Sync may succeed for some attachments and fail for others, but each attachment publishes atomically.
- Retain source bytes for text documents and extracted representations inside the generation so exact retrieval does not depend on Git objects surviving force-push or garbage collection.
- Retain the current and previous bounded generations per attachment, and pin generations referenced by the active MCP session. Define a configurable retention owner/default before implementation. When an unpinned handle references an evicted generation, return `snapshot-evicted` with current revision information rather than silently returning newer content.
- Separate stable identity from revision-qualified retrieval:
  - Recall exposes stable `documentId` and `chunkId` for grouping.
  - Recall also returns an opaque revision-qualified `retrievalHandle` containing or resolving to attachment ID, generation ID, and document identity.
  - The handle uses a namespace invalid for Memory IDs and is the value passed to `get` when exact recalled content is required.
- Extend `get` without breaking memory-only callers:
  - Existing memory-only calls and `notes` output remain unchanged.
  - A revision-qualified document handle resolves to a discriminated `document` result from the pinned generation.
  - Mixed calls expose an ordered discriminated `items` array while retaining existing `notes` and `notFound` fields for compatibility.
  - `count` means total successfully resolved items; this is unchanged for memory-only calls.
  - Add `documents` and per-item `itemErrors` for stale, evicted, oversized, unavailable, or unknown document references so one failure does not fail unrelated results.
- For `text/markdown`, return exact source text preserving line endings, leading/trailing blank lines, BOM policy, and terminal-newline state, with `sourceMediaType: "text/markdown"` and `contentMediaType: "text/markdown"`.
- Keep source and extracted representations separate. A future PDF extractor may return extracted text while raw `application/pdf` bytes use a separate MCP resource mechanism; never label extracted text as PDF content.
- Define the full-response size limit in public configuration. Return full text within the bound; otherwise return an explicit `content-too-large` item error with size and retrieval guidance. Never silently truncate.
- Update `get` tool guidance so mutation follow-ups apply only to memory results.

Likely files: `src/tools/get.ts`, `src/structured-content.ts`, document generation/index storage, entity resolver, cache helpers, schema snapshots, and exact-source/get integration tests.

## Stage 4: centralized mutation rejection

- Broaden mutation input validation only enough to parse reserved document/chunk namespaces, then route every target through the central entity resolver before vault lookup.
- `update`, `forget`, `move_memory`, `relate`, `unrelate`, and `consolidate` continue to mutate managed Memory IDs only.
- Return distinct errors:
  - external document/chunk: explicit immutable external-document error;
  - read-only Mnemonic attachment: existing attached-vault read-only error;
  - writable Mnemonic attachment: continue through current mutation guards;
  - unknown identifier: genuine not-found error.
- Tool descriptions and structured results must never imply documents can be updated through Mnemonic.
- Add contract tests for every mutation path and every entity classification.

Likely files: entity resolver and mutation guard helpers, mutating tools, domain errors, structured schemas, tool descriptions, and mutation integration tests.

## Stage 5: explicit sync and reconciliation

- Fetch and resolve an exact remote-tracking commit rather than assuming a configured local branch advances.
- Enumerate and read all source blobs from that one commit.
- Compare commit/blob/content fingerprints and complete extraction/index compatibility identity with the current generation.
- Rebuild only changed/new/invalidated chunks, remove deleted derived records, and publish one coherent generation. `force` rebuilds all document artifacts.
- Publish only after manifest validation. Invalidate caches after pointer swap.
- Report indexed commit, generation ID, source media-type counts, document/chunk counts, skipped files, semantic coverage, additions/updates/deletions, embeddings, failures, and stale/index status.
- Add concurrency tests where `get` or recall reads the old generation while sync publishes the next generation.

Likely files: `src/tools/sync.ts`, Git/ref helpers, document index/extractor registry, cache helpers, sync/staleness/concurrency tests.

## Stage 6: mixed default recall activation

- Keep document candidates feature-gated until Stages 1-5 are complete. Do not expose unusable document IDs in an intermediate release.
- Adapt existing Note/Vault candidates as `memory`; derived document candidates are `document-chunk`.
- Document chunks participate in the common semantic and lexical candidate pools before dense ranks are assigned so RRF channels remain comparable.
- Apply a bounded per-document chunk cap before the rank window so one document cannot consume the candidate pool. After final scoring, enforce result diversity while scanning farther down the ranked list to refill the requested limit.
- Apply project attachment prior only. Exclude document chunks from graph, canonical-memory, role, lifecycle, relationship, confidence, and temporal contributions.
- Include document chunks only for project/all default recall. Exclude them from global scope, tag/lifecycle filters, temporal mode, and workflow mode in the MVP.
- Return `kind: "document-chunk"`, stable chunk/document IDs, revision-qualified retrieval handle, source path, heading ancestry, excerpt, attachment identity, source media type, extraction metadata, indexed revision, and generation ID.
- Preserve existing memory result fields and rendering.
- Add mixed ranking tests for semantic/lexical admission, dense-rank placement, per-document caps, limit refill, compatible embedding spaces, citations, filters/modes/scopes, generation pinning, failure isolation, and schema/text output.

Likely files: `src/tools/recall.ts`, `src/tools/recall-helpers.ts`, `src/recall.ts`, `src/structured-content.ts`, cache/index adapters, and recall integration tests.

## Release gate and deferred work

The first public release requires all six stages so recall, exact retrieval, mutation behavior, and synchronization form one coherent contract.

Deferred:

- PDF, HTML, and other extractors.
- Raw binary delivery through MCP resources.
- Document browsing through `list`, recent memories, project summary, memory graph, relationships, consolidation of document content, temporal/workflow document recall, and write-through document editing.

## Documentation and verification

- Update `ARCHITECTURE.md`, `AGENT.md`, `README.md`, `SYSTEM_PROMPT.md` where behavior guidance changes, `docs/index.html`, and `CHANGELOG.md` as stages land.
- Update all attachment tool descriptions, output schemas, `.describe()` metadata, MCP schema snapshots, and real response-parsing tests.
- At each stage run typecheck, focused unit/integration tests, full tests, lint, Slopwatch, and isolated MCP dogfooding.
- Before implementation, ratify the remaining public defaults: generation retention count/TTL, full-response size limit, default exclude patterns, per-document chunk cap, and whether unsupported media types partially index supported files or disable the attachment.
