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
updatedAt: '2026-03-14T19:49:17.846Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Plan status update for performance optimization pass.

Completed:

- Opportunity 1 implemented: recall per-request note cache.
  - Commit: `perf: cache recall note reads per request`
  - Validation: `npm test -- tests/recall.test.ts`.
- Opportunity 2 implemented: consolidate analysis reuses preloaded embeddings.
  - Commit: `perf: reuse embeddings in consolidate analysis`
  - Validation: `npm test -- tests/consolidate.test.ts`.
- Opportunity 3 implemented: `Storage.listNotes` now reads note files in parallel with `Promise.all` while preserving deterministic output order from sorted note ids.
  - Commit: `perf: parallelize Storage.listNotes reads`
  - Validation: `npm test -- tests/storage.test.ts tests/recall.test.ts tests/project-introspection.test.ts`.

Remaining sequence:

1) parallelize `Storage.listEmbeddings` reads,
2) reduce duplicate git-root lookups in vault search flow.
