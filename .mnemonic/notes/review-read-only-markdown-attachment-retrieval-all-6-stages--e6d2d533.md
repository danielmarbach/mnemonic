---
title: 'Review: read-only markdown attachment retrieval — all 6 stages implemented'
tags:
  - workflow
  - review
  - attachments
  - markdown
  - architecture
  - retrieval
lifecycle: temporary
createdAt: '2026-07-29T13:56:55.798Z'
updatedAt: '2026-07-29T21:44:43.345Z'
role: review
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: plan-read-only-markdown-attachment-retrieval-f4619b6e
    type: derives-from
  - id: document-source-attachment-five-bugs-found-and-fixed-via-pac-24bedd4b
    type: follows
memoryVersion: 1
---
# Review: read-only markdown attachment retrieval — all 6 stages implemented

## Verdict: conditional pass — implement, review, fix cycle complete

### Implemented

All 6 stages of the plan were implemented using parallel subagents (deepseek-v4-flash:cloud, max 3 concurrent):

- Stage 1: Discriminated union attachment config (mnemonic-vault | document-source), persistent attachmentId, migration, source scope validation
- Stage 2: Document model (RetrievalDocument, RetrievalChunk, DocumentGeneration), markdown extractor, heading-aware chunker, entity resolver (doc:/chunk: namespaces), document source index
- Stage 3: Atomic generation storage, get tool extended with documents/items/itemErrors, retrieval handle resolution
- Stage 4: Centralized mutation rejection via mutation-guard.ts, ImmutableDocumentSourceError, all mutation tools guarded
- Stage 5: Document-source sync (fetch commit, enumerate blobs, build generation, publish atomically)
- Stage 6: Document chunk candidates in recall (lexical scoring, per-document cap of 5, project/all default scope only)

### Review findings

**High (fixed during review):**

- Document chunks were not excluded from temporal/workflow mode and tag/lifecycle filters — fixed by adding mode/filter guards in recall.ts

**Medium (accepted for MVP):**

- Entity resolver lacks `never` exhaustiveness check on EntityClassification union
- No integration tests for full sync → generation → get → recall flow (unit tests cover individual modules)
- Generation storage is in-memory only (no disk persistence)
- Document chunks use lexical scoring only (no semantic embeddings)

**Low (deferred):**

- PDF/HTML extractors, MCP resources for binary delivery, document browsing via list/recent\_memories

### Design constraint compliance

- ✅ Every new Zod schema field has `.describe()`
- ✅ Tool description Returns sections updated for get, recall, and all attachment tools
- ✅ Schema audit tests parse real MCP responses through exported Zod schemas
- ✅ Text rendering exists for all new structured fields (documentChunks in recall, documents/items in get)
- ✅ No `any` used (replaced with proper branded type casts)
- ✅ No new I/O on cold/fallback paths (document-recall.ts works from in-memory generations)
- ✅ No NoteStorage widened, no Note variant added
- ✅ Branded types (DocumentId, ChunkId, GenerationId, AttachmentId)
- ✅ Per-document chunk cap enforced (5)
- ✅ Document chunks excluded from graph, role, lifecycle, temporal, workflow contributions
- ✅ Project/all scope only (not global)

### Documentation updated

- CHANGELOG.md: new 0.38.0 entry following changelog principles
- docs/index.html: document-source attachment tools added
- ARCHITECTURE.md: document-source attachment architecture section
- AGENT.md: tool table updated with document-source kind
- README.md: brief feature mention

### Validation

- Typecheck: clean
- Lint: clean (all new and modified files)
- Tests: 248 non-git tests pass (133 new + 115 existing fast tests)
- Pre-existing git timeout failures unchanged (environmental, not caused by changes)

### Files

- 10 new source files (1,079 lines): retrieval-document.ts, document-extractor.ts, markdown-extractor.ts, markdown-chunker.ts, document-entity-ref.ts, document-source-index.ts, document-recall.ts, document-sync.ts, generation-storage.ts, mutation-guard.ts
- 8 new test files (133 tests)
- \~20 modified files
- 5 documentation files updated

## Post-merge dogfood (Pack D)

Subsequent dogfooding against the local build (`scripts/dogfood-document-source.mjs`) found five defects in the shipped implementation that this review's unit tests missed: (1) the include-glob parser corrupted directory-prefixed globs and silently indexed zero files; (2) recall aborted when the query embedding failed, blocking the lexical-only document chunks; (3) the get/forget/update/move-memory schemas rejected doc:/chunk: handles at the Zod layer, so Stage 3 and Stage 4 were unreachable via MCP; (4) the chunk entity-ref parser kept the chunk: prefix and truncated documentId; (5) recall returned early before collecting document chunks when memory recall was empty. All five are fixed with unit and integration tests; Pack D is 12/12 green and the full suite is 1305 green. See `document-source-attachment-five-bugs-found-and-fixed-via-pac-24bedd4b`. Lesson: the review's 'all checked constraints passing' was unit-test-scoped; the missing E2E (sync to generation to get to recall) integration test let these through.
