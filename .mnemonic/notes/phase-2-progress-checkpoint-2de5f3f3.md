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
updatedAt: '2026-05-23T13:13:33.773Z'
role: context
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
# Phase 2 progress checkpoint

## Completed sub-phases

- **2a (partial)**: AttachedStorage unit tests (45), vault helpers (14), config (61), isProject migration (4), mutation error (6 skipped/fixture needed)
- **2b (complete)**: P0 verification and implementation
  - Item 13: ATTACHMENT_BOOST = 0.015 for attached vaults in recall
  - Item 14: collectVisibleNotes composite dedup already uses `${note.id}::${vault.storage.vaultPath}`
  - Item 15: scope:project attachment-extended semantics in recall, recall-helpers, collectVisibleNotes
  - Item 16: storedIn: "attached" already implemented
  - Item 17: ProjectSummaryNotesSchema.attachedVault count field added
  - Review fix: collectVisibleNotes excludes attached vaults from scope:global
  - Review fix: Updated scope descriptions in list.ts and discover-tags.ts
- **2c (partial)**: Staleness detection in loadAttachmentsForProject (item 19)
- **2d (partial)**: Remember tool uses storageLabel for consistency (item 23)

## Remaining items

- 2a: Full integration test fixture (items 2-5)
- 2c: Embedding reconciliation on staleness (item 20), sync-triggered cache invalidation already done (item 21), unit tests (item 22)
- 2d: Output rendering tests (item 26), schema description updates (item 25 — already done in schema)
- 2e: Auto-sync investigation (items 27-29)
- 2f: Machine-specific path portability (items 30-32)
- 2g: Documentation + final verification (items 33-36)

## Commits

- 5ce071b feat: add attachment boost and scope-extended semantics
- 992b9d6 fix: exclude attached vault notes from global scope, update scope descriptions
- fc59760 test: add vault helpers unit tests (14 tests)
- a5a839d test: add AttachedStorage unit tests (45 tests)
- 7a9d85e test: add config attachment, isProject, mutation error, vault attachment tests
- 26c764b feat: add staleness detection to loadAttachmentsForProject
- 4e5d934 fix: use storageLabel for consistent vault labels in remember
