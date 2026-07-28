---
title: 'Review: document-source attachment plan needs revision'
tags:
  - workflow
  - review
  - attachments
  - architecture
  - retrieval
  - markdown
lifecycle: temporary
createdAt: '2026-07-28T08:45:59.625Z'
updatedAt: '2026-07-28T08:45:59.625Z'
role: review
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Independent fresh-context review verdict: the document-source attachment direction is sound, but the current plan needs revision before implementation.

## Contract blockers

1. Attachment identity migration is unspecified. Define deterministic legacy IDs or a one-time persisted migration, preserve unambiguous `projectSlug` selectors for compatibility, and return ambiguity errors once one repository has multiple attachments.
2. Document-source scope fields are missing. Define repository-relative `root`, include/exclude defaults and matching semantics, path normalization, case sensitivity, symlink policy, and tracked-files-only behavior in Stage 1.
3. Stable document IDs cannot alone guarantee exact-revision `get`. Recall must return a revision-qualified retrieval handle or `get` must accept document ID plus indexed revision, with retained snapshots and explicit eviction behavior.
4. Rollout order is unsafe. Recall must not expose document IDs before `get` and centralized mutation rejection are available; deliver retrieval and rejection atomically or feature-gate document candidates.
5. ID namespace and routing are underspecified. Use a collision-free namespace that cannot parse as a Memory ID, plus a central entity resolver distinguishing documents, read-only Mnemonic notes, writable Mnemonic notes, and unknown IDs.

## High-priority refinements

- Treat `acceptedMediaTypes` as an open, non-empty string array. Normalize and validate IANA base media types while preserving unsupported future values in persisted config instead of dropping them.
- Use `sourceMediaType` consistently and distinguish source, extracted, chunk, excerpt, and returned-content representations.
- Add extractor ID/version, chunker ID/version, options hashes, index/projection schema versions, and embedding compatibility identity to invalidation metadata.
- Define per-attachment generation directories, atomic publication, request-level generation pinning, first-build failure behavior, skipped-file rules, and cache invalidation only after publication.
- Merge document semantic and lexical candidates into common rank pools before dense ranks; apply per-document diversity before the rank window and refill final limits afterward.
- Define mixed `get` compatibility: separate document results, stable count semantics, request ordering, per-item stale/oversized errors, and tool guidance that does not recommend mutation for documents.
- Branch document-source handling at attachment creation and loading so it never requires `.mnemonic/notes` or routes through vault initialization.

## Validation evidence

The reviewer inspected current code and plan, ran 120 targeted attachment-normalization and recall-ranking tests successfully, confirmed no staged files, and made no project changes.

The current plan should be updated only after these findings are dispositioned.
