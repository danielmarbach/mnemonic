---
title: Multi-repo attachment implementation history
tags:
  - workflow
  - summary
  - attachments
  - phase2
  - phase3
lifecycle: permanent
createdAt: '2026-05-25T17:21:07.693Z'
updatedAt: '2026-05-25T17:21:07.693Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: multi-repository-attachment-support-request-root-151ad76c
    type: derives-from
  - id: multi-repository-attachment-support-implementation-plan-b6423f79
    type: derives-from
  - id: multi-repo-attachment-phase-3-request-root-58d643a2
    type: derives-from
memoryVersion: 1
---
Consolidate phase-specific multi-repo attachment notes into one chronological implementation history while preserving unique evidence and source lineage.

# Multi-repo attachment implementation history

Consolidated implementation history for multi-repository attachment support. This note preserves the Phase 1 implementation summary, Phase 2 verification and test work, Phase 2 research findings, and the Phase 3 write-through/cross-vault plan.

## Phase 1: Attachment infrastructure

Phase 1 shipped the core attachment model and read-path support.

- Added `VaultProvenance`, `AttachmentRef`, `ProjectAttachmentConfig`, and `StorageScope: "attached"`.
- Added the `Vault.writable` concept and migrated call sites away from `Vault.isProject`.
- Added config support for `projectAttachments` and `maxAttachmentsPerProject`, including schema migration `1.2`.
- Added `AttachedStorage` for git-ref reads, working-tree fallback, session caching, and fail-soft reads.
- Added attachment-aware vault routing, two-step lookup, scope filtering, storage labels, and dedup behavior.
- Added attachment management tools: `add_attachment`, `remove_attachment`, `list_attachments`, `set_attachment_enabled`, and `set_attachment_branch`.
- Updated sync integration and documentation in README, AGENT.md, and CHANGELOG.

## Phase 2: Verification, correctness, and polish

Phase 2 focused on proving attachment read-path behavior and fixing correctness gaps discovered after Phase 1.

- Added broad unit and integration coverage for attached storage, vault helpers, config attachment handling, attachment routing, recall behavior, and mutation guard behavior.
- Implemented `ATTACHMENT_BOOST = 0.015` for project-attached vaults in recall.
- Verified `scope: "project"` includes attached vault notes and `scope: "global"` excludes them.
- Added `ProjectSummaryNotesSchema.attachedVault` optional count support.
- Fixed `collectVisibleNotes` so global scope excludes attached vaults.
- Updated scope descriptions in list and discover-tags tooling.
- Added staleness detection in `loadAttachmentsForProject` by comparing stored `branchTipHash` with current git tip.
- Preserved sync-triggered cache invalidation.
- Updated output rendering to use `storageLabel()` consistently.

## Phase 2 deferred work

- Auto-sync on branch change was investigated but deferred.
- Machine-specific path portability remains a known limitation because attachment configs use local absolute paths.
- Embedding reconciliation on attachment staleness was deferred because it requires note diffing.
- Some integration tests remained fixture-dependent and skipped.

## Phase 3: Planned write-through and cross-vault relationships

Phase 3 was planned around three streams: writable attached vaults, cross-vault relationship traversal, and residual tests.

### Write-through to attached vaults

- Add `writable?: boolean` and `pushBranch?: string` to `AttachmentRef`, defaulting writable attachments to disabled.
- Enable `AttachedStorage` writes only when the attachment is explicitly writable; non-writable attachments continue to throw read-only errors.
- Include writable attached vaults in mutable vault search order and mutation routing.
- Allow update, forget, relate, unrelate, consolidate, and move operations only for writable attached vaults.
- Commit mutations scoped to the attached vault notes directory and optionally push to `pushBranch`.
- Invalidate session and attached storage caches after mutation.
- Update `branchTipHash` after write-push to avoid spurious staleness reloads.

### Cross-vault relationships

- Add optional `vaultPath` to relationships for vault-qualified edges while preserving backward compatibility with bare note ids.
- Resolve relationship previews and graph traversal across vault boundaries.
- Store vault-qualified relationship entries when related notes live in different vaults.
- Handle dangling relationship cleanup best-effort across all visible writable vaults.

### Residual tests

- Re-enable skipped mutation error tests for non-writable attached vaults.
- Add writable attached vault mutation tests for remember, update, forget, and relate.
- Add cross-vault relate/unrelate integration tests.

## Phase 3 review findings

Phase 3 review found the structure sound but identified follow-up gaps:

- `AttachedStorage.invalidateCache()` was not called after write-through mutations.
- `branchTipHash` was not updated after write-push.
- Writable getter logic existed in two places and should be unified.
- `attachedVaultErrorMessage` still described attached vaults as read-only unconditionally.
- Tool descriptions did not fully mention writable attachments.
- Several residual relationship and summary tests still needed investigation.

## Verification history

- Phase 1 type migration passed 926 tests.
- Phase 2 reported 1063 to 1064 passing tests with fixture-dependent skips and one flaky pre-existing timeout.
- Phase 3 review reported TypeScript passing, with remaining integration test failures or skips to address.
