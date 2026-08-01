---
title: 'Document-source attachments: design, delivery, and verification (canonical)'
tags:
  - attachments
  - document-source
  - markdown
  - retrieval
  - architecture
  - decision
lifecycle: permanent
createdAt: '2026-08-01T09:26:59.248Z'
updatedAt: '2026-08-01T20:35:22.138Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: document-source-attachment-five-bugs-found-and-fixed-via-pac-24bedd4b
    type: follows
  - id: docs-gap-fixed-attachment-configuration-documented-in-readme-93c55f0d
    type: related-to
  - id: pack-d-document-source-attachment-dogfood-pack-and-a-b-c-con-4f75a70c
    type: related-to
  - id: document-source-chunk-embeddings-specified-but-never-deliver-6e867617
    type: explains
memoryVersion: 1
---
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
