---
title: 'Flatten doc-source embeddings path: drop redundant projectId segment'
tags:
  - decision
  - attachments
  - document-source
  - embeddings
  - storage
  - path-layout
lifecycle: permanent
createdAt: '2026-08-03T15:21:23.609Z'
updatedAt: '2026-08-30T11:19:37.525Z'
role: decision
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: chunk-embedding-path-layout-drop-redundant-guid-prefix-lower-6b739d42
    type: derives-from
  - id: document-source-chunk-embeddings-use-xxh128-for-filenames-an-e3e988b8
    type: derives-from
  - id: document-source-embeddings-for-global-policy-projects-main-v-ff2954f1
    type: related-to
memoryVersion: 1
---
# Flatten doc-source embeddings path: drop redundant projectId segment

## Context

The main-vault fallback path for document-source chunk embeddings included a `projectId` directory segment derived from the git remote URL:

```text
~/mnemonic-vault/embeddings/doc-source/{projectId}/{attachmentId}/
```

The `projectId` was the slugified remote URL (e.g. `github-com-particular-nservicebus`, ~40 chars). The `attachmentId` is a UUID (v4), so the project namespace was redundant for uniqueness. It only provided organizational grouping and bulk cleanup, both also achievable via the attachment config.

## Decision

Remove the `projectId` segment. The path is now `doc-source/{attachmentId}/` in all cases:

```text
Project vault: .mnemonic/embeddings/doc-source/{attachmentId}/
Main fallback: ~/mnemonic-vault/embeddings/doc-source/{attachmentId}/
```

The `resolveDocSourceBase` function in `document-manifest.ts` dropped its `projectId` parameter. All callers in `sync.ts`, `recall.ts`, `get.ts`, and `remove-attachment.ts` were updated.

## Why

1. Redundant uniqueness — `attachmentId` is a UUID; collisions between projects are astronomically unlikely.
2. Path depth — the project ID segment added ~40 chars, risking deep-path issues on Windows (NTFS 260-char limit). The recent `chunk-embedding-path-layout` decision fixed filename length (slug to xxh128), but directory nesting was a separate concern.
3. Consistency — the project-vault case never had the segment; only the main-vault fallback did. Now both are uniform.

## Breaking change

Existing embeddings at the old `doc-source/{projectId}/{attachmentId}/` path are orphaned. Users run `sync` to re-index at the new flat path. Old directories are gitignored and re-computable, so no data loss — just a one-time re-embed.

## What changed (commit d5d7aa9, branch flatten-doc-source-path, v0.42.1)

- `src/document-manifest.ts` — `resolveDocSourceBase` drops `projectId` param
- `src/tools/sync.ts` — remove `project.id` from main-vault path construction
- `src/tools/recall.ts` — same
- `src/tools/get.ts` — same
- `src/tools/remove-attachment.ts` — remove `project.id` from main-vault cleanup path
- `src/document-sync.ts` — updated comment
- `tests/document-manifest.unit.test.ts` — updated `resolveDocSourceBase` calls
- `tests/document-source.integration.test.ts` — updated fallback path assertion
- `CHANGELOG.md` — 0.42.1 entry
- `package.json` and `package-lock.json` — bumped to 0.42.1

## Verification

- Typecheck clean, lint clean, format clean
- 42 unit + integration tests pass (document-manifest, document-lazy-load, document-source)
- Pack D dogfood: 12/12 green

## Relationship to prior decisions

- Reverses the namespacing choice in `document-source-embeddings-for-global-policy-projects-main-v-ff2954f1` (Decision 1), which added the `projectId` segment.
- Consistent with `chunk-embedding-path-layout-drop-redundant-guid-prefix-lower-6b739d42` which stripped redundant prefixes from filenames.
- Consistent with `document-source-chunk-embeddings-use-xxh128-for-filenames-an-e3e988b8` which bounded filenames to 32 hex chars.
