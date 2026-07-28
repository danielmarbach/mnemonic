---
title: 'Review: narrow Markdown attachments to read-only retrieval'
tags:
  - workflow
  - review
  - attachments
  - markdown
  - architecture
  - retrieval
lifecycle: temporary
createdAt: '2026-07-28T08:10:39.665Z'
updatedAt: '2026-07-28T08:10:39.665Z'
role: review
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Two independent architecture reviews converged on the same verdict: narrow and proceed.

## Endorsed

- Keep `Attachment` as the user-facing federation concept.
- Add a Markdown attachment kind.
- Use heading-aware, bounded chunking for documentation retrieval.
- Avoid persisted synthetic Mnemonic notes.
- Limit the MVP to explicit sync and default recall.

## Required corrections

- Do not model Markdown attachments internally as `Vault` or `NoteStorage`.
- Do not claim a projection provider leaves upper layers unchanged. Recall, cache, provenance, output schemas, exact lookup, filters, graph traversal, and confidence logic currently depend on `Note` and `MemoryId`.
- Do not generalize all Mnemonic notes to multiple projections in the first implementation. Add a narrow retrieval-document/chunk seam and adapt existing notes at the recall boundary.
- Do not index an arbitrary repository during recall. Index a pinned Git revision during explicit sync and consume the last complete local manifest.
- Do not expose chunk IDs as memory IDs or imply compatibility with `get` or mutation tools.

## Review gates

Implementation must wait for explicit acceptance of two contracts:

1. Markdown hits are a distinct `markdown-chunk` recall result kind with source path, heading ancestry, excerpt, attachment identity, and indexed revision.
2. Attachment identity is separate from repository slug so one repository can host multiple attachment kinds or roots.

No product or source files were modified during review.
