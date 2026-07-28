---
title: 'Research: arbitrary Markdown attachments require a retrieval seam'
tags:
  - workflow
  - research
  - attachments
  - markdown
  - architecture
  - retrieval
lifecycle: temporary
createdAt: '2026-07-28T08:07:20.310Z'
updatedAt: '2026-07-28T08:08:31.518Z'
role: research
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: request-assess-arbitrary-markdown-repository-attachments-6aff8f56
    type: derives-from
  - id: plan-read-only-markdown-attachment-retrieval-f4619b6e
    type: derives-from
memoryVersion: 1
---
Recommendation: narrow and proceed. Keep `Attachment` as the user-facing federation concept, but do not represent arbitrary Markdown repositories internally as mnemonic vaults and do not claim a projection provider leaves upper layers unchanged.

## Evidence

- `ProjectAttachmentConfig` and `Vault` assume every attachment is a Mnemonic vault backed by `NoteStorage` (`src/vault.ts`).
- `AttachedStorage` enumerates one notes directory, converts file basenames to `MemoryId`, and parses every file as a Mnemonic `Note` (`src/attached-storage.ts`).
- `NoteStorage`, `EmbeddingRecord`, and `NoteProjection` are keyed one-to-one by note ID (`src/storage.ts`, `src/structured-content.ts`).
- `buildProjection` emits one compact projection per note, capped at 1200 characters. Long notes are not normally embedded as one giant raw document; heading chunking is valuable for section-level retrieval, not primarily to avoid an unbounded embedding (`src/projections.ts`).
- Recall scans embeddings and then must rehydrate a `Note` to apply tags, lifecycle, role, relationships, provenance, confidence, formatting, and output contracts (`src/tools/recall.ts`, `src/tools/recall-helpers.ts`).
- Current sync compares note IDs to embedding IDs. Multiple chunks per document require a manifest, stable chunk identities, and explicit reconciliation (`src/tools/sync.ts`).
- Current attachment identity is the normalized remote slug, so the same repository cannot be attached as both a Mnemonic vault and one or more Markdown roots without a separate attachment ID (`src/tools/add-attachment.ts`).

## Recommended boundary

Add a discriminated attachment configuration while preserving missing `kind` as `mnemonic`. Markdown attachments are source-read-only and produce consumer-local derived retrieval documents and chunks. Introduce a narrow internal retrieval candidate union at recall rather than widening `NoteStorage` or persisting synthetic notes.

A Markdown recall result must be explicitly non-memory content and include attachment identity, repository-relative path, heading ancestry, excerpt, and indexed Git revision. It must not imply compatibility with `get`, mutation tools, relationships, consolidation, workflow recall, or temporal recall.

## MVP constraints

- Explicit sync indexes a pinned remote-tracking commit; recall never triggers repository-wide indexing.
- Derived manifest, projections, and embeddings live outside the attached repository.
- Enforce bounds on files, bytes, chunks, and results per document.
- Default recall only; exclude Markdown chunks when lifecycle or tag filters request memory semantics.
- Defer list/get/project summary/graph/relationships/mutations.

## Open product contracts

1. Confirm Markdown recall hits are a distinct `markdown-chunk` result kind, not memory IDs.
2. Confirm attachment identity is separate from repository slug so one repository may host multiple attachment kinds or roots.
