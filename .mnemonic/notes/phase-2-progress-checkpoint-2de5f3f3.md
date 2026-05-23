---
title: Phase 2 progress checkpoint
tags:
  - workflow
  - apply
  - attachments
  - phase2
  - checkpoint
lifecycle: temporary
createdAt: '2026-05-23T13:13:33.773Z'
updatedAt: '2026-05-23T18:09:54.605Z'
role: context
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
# Phase 2 progress checkpoint (updated)

## Completed sub-phases

- **2a (partial)**: AttachedStorage unit tests (45), vault helpers (14), config (61), isProject migration (4), mutation error (6 skipped/fixture needed). Integration test fixture helper created.
- **2b (complete)**: P0 verification and implementation
- **2c (partial)**: Staleness detection done, embedding reconciliation done (both sync.ts and ensureBranchSynced remove stale embeddings on tip change). Unit tests for staleness still needed.
- **2d (partial)**: Remember uses storageLabel (item 23 done), schema descriptions done (item 25)
- **2e (complete)**: Auto-sync for attached vaults implemented in ensureBranchSynced. Fetches enabled attached vaults on branch change, updates tip hashes, clears caches, removes stale embeddings.
- **2f (complete)**: Path portability. `expandHomePath` and `collapseHomePath` in paths.ts. `add-attachment` now supports `~` expansion via `expandHomePath` and stores portable paths via `collapseHomePath`. All attachment tools and `loadAttachmentsForProject` resolve `~` at runtime via `expandHomePath`. Tests added for collapseHomePath.

## Remaining items

- 2a: Full integration test fixtures (items 2-6, 8-9)
- 2c: Unit tests for staleness detection (item 22)
- 2d: Output rendering tests (item 26)
- 2g: Documentation + final verification (items 33-36)
