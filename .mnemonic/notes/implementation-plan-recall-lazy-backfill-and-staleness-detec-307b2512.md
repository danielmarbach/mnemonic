---
title: 'Implementation plan: recall lazy backfill and staleness detection'
tags:
  - plan
  - embeddings
  - recall
  - completed
  - backfill
lifecycle: temporary
createdAt: '2026-03-10T19:32:13.115Z'
updatedAt: '2026-03-10T19:58:07.203Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: embedding-lazy-backfill-and-staleness-detection-approach-dec-acde8772
    type: explains
  - id: embedding-lazy-backfill-and-staleness-detection-implementati-235207a1
    type: supersedes
  - id: embedding-lazy-backfill-and-staleness-detection-implementati-b3415cb2
    type: supersedes
  - id: embedding-lazy-backfill-and-staleness-detection-implementati-a416e3f7
    type: supersedes
  - id: embedding-lazy-backfill-and-staleness-detection-implementati-eb820222
    type: supersedes
memoryVersion: 1
---
## Goal

Make notes visible in recall immediately after a git pull and after direct editor edits.

## Status: COMPLETE

All tasks done — see decision note for rationale.

### Changes made

1. `src/index.ts` — staleness check: `if (existing?.model === embedModel && existing.updatedAt >= note.updatedAt)`
2. `src/index.ts` — pre-recall backfill: call `embedMissingNotes(vault.storage)` per vault before search loop
3. `src/storage.ts` — bonus fix: `toIsoString()` helper in `parseNote` converts gray-matter Date objects to ISO strings (affects notes arriving via git pull)
4. `tests/mcp.integration.test.ts` — 3 new integration tests: lazy backfill, staleness re-embed, offline graceful failure
5. All 162 tests pass
