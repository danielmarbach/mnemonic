---
title: Multi-repo attachment — Phase 2 implementation summary
tags:
  - workflow
  - summary
  - attachments
  - phase2
lifecycle: permanent
createdAt: '2026-05-23T13:16:52.923Z'
updatedAt: '2026-05-25T17:21:07.693Z'
role: summary
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: multi-repo-attachment-implementation-history-d0630b71
    type: supersedes
memoryVersion: 1
---
# Multi-repo attachment — Phase 2 implementation summary

## Phase 2a: Test suite (partial)

- AttachedStorage unit tests: 45 tests
- Vault helpers unit tests: 14 tests (storageLabel, vaultMatchesStorageScope, attachedVaultErrorMessage, ProjectSummaryNotesSchema)
- Config attachment unit tests: 61 tests
- IsProject migration verification: 4 tests
- Vault attachment functionality: 11 tests
- Recall attachment integration: 1 passing, 3 skipped (fixture-dependent)
- Mutation error integration: 6 skipped (fixture-dependent)

## Phase 2b: P0 verification and implementation

- ATTACHMENT_BOOST = 0.015 for project-attached vaults in recall
- scope:project includes attached vault notes (attachment-extended semantics)
- scope:global excludes attached vault notes
- ProjectSummaryNotesSchema.attachedVault optional count field
- Review fix: collectVisibleNotes excludes attached vaults from scope:global
- Review fix: Updated scope descriptions in list.ts and discover-tags.ts

## Phase 2c: Staleness detection

- loadAttachmentsForProject compares stored branchTipHash against current git tip
- Sync-triggered cache invalidation already implemented in sync.ts
- Embedding reconciliation on staleness deferred (requires note diffing)

## Phase 2d: Output rendering

- Remember tool uses storageLabel() for consistent vault labels
- Working-tree mode warning already implemented in add_attachment
- Schema descriptions already accept attached: pattern

## Phase 2g: Documentation

- CHANGELOG.md updated with Phase 2 additions
- AGENT.md updated with Phase 2 additions

## Deferred

- Auto-sync on branch change (investigated, deferred)
- Machine-specific path portability (known limitation)
- Full integration test fixture (requires complex multi-repo setup)
- Embedding reconciliation on staleness detection

## Verification

- 1063+ tests passing, 9 skipped (fixture-dependent), 1 flaky pre-existing timeout
