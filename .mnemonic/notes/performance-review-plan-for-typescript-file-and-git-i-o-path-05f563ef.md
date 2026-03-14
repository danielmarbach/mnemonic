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
updatedAt: '2026-03-14T19:48:08.576Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Plan status update for performance optimization pass.

Completed:

- Opportunity 1 implemented: recall now uses a per-request note cache keyed by vault path and note id, eliminating duplicate `readNote` and parse work during scoring and output formatting.
- Commit: `perf: cache recall note reads per request`.
- Validation: `npm test -- tests/recall.test.ts` passed.

Remaining sequence:

1) cache embeddings once in consolidation pairwise analysis,
2) parallelize `Storage.listNotes` reads while preserving order,
3) parallelize `Storage.listEmbeddings` reads,
4) reduce duplicate git-root lookups in vault search flow.
