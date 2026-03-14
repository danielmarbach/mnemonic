---
title: Performance review plan for TypeScript file and git I/O paths
tags:
  - plan
  - performance
  - io
  - git
  - stage-1
lifecycle: temporary
createdAt: '2026-03-14T19:42:35.123Z'
updatedAt: '2026-03-14T19:50:34.740Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Plan status update for performance optimization pass.

Completed opportunities (all recommended low-risk items):

1) Recall per-request note cache.
   - Commit: `perf: cache recall note reads per request`
   - Validation: `npm test -- tests/recall.test.ts`.
2) Consolidate analysis embedding reuse.
   - Commit: `perf: reuse embeddings in consolidate analysis`
   - Validation: `npm test -- tests/consolidate.test.ts`.
3) `Storage.listNotes` parallel file reads with preserved order.
   - Commit: `perf: parallelize Storage.listNotes reads`
   - Validation: `npm test -- tests/storage.test.ts tests/recall.test.ts tests/project-introspection.test.ts`.
4) `Storage.listEmbeddings` parallel file reads.
   - Commit: `perf: parallelize Storage.listEmbeddings reads`
   - Validation: `npm test -- tests/embeddings.test.ts tests/recall.test.ts tests/consolidate.test.ts`.
5) `VaultManager.searchOrder` single git-root resolution per call.
   - Commit: `perf: avoid duplicate git-root lookup in searchOrder`
   - Validation: `npm test -- tests/vault.test.ts tests/project.test.ts tests/project-introspection.test.ts`.

Status: implementation sequence complete; next step is to capture general performance lessons and link them to architecture/design decisions for future changes.
