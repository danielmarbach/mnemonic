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
updatedAt: '2026-03-14T19:49:51.165Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Plan status update for performance optimization pass.

Completed:

- Opportunity 1: recall per-request note cache.
  - Commit: `perf: cache recall note reads per request`
  - Validation: `npm test -- tests/recall.test.ts`.
- Opportunity 2: consolidate analysis reuses preloaded embeddings.
  - Commit: `perf: reuse embeddings in consolidate analysis`
  - Validation: `npm test -- tests/consolidate.test.ts`.
- Opportunity 3: parallelized `Storage.listNotes` reads with order preserved.
  - Commit: `perf: parallelize Storage.listNotes reads`
  - Validation: `npm test -- tests/storage.test.ts tests/recall.test.ts tests/project-introspection.test.ts`.
- Opportunity 4: parallelized `Storage.listEmbeddings` reads.
  - Commit: `perf: parallelize Storage.listEmbeddings reads`
  - Validation: `npm test -- tests/embeddings.test.ts tests/recall.test.ts tests/consolidate.test.ts`.

Remaining sequence:

1) reduce duplicate git-root lookups in vault search flow.
