---
title: 'Apply: Phase 3 — write-through, cross-vault relationships, tests'
tags:
  - workflow
  - apply
  - attachments
  - phase3
lifecycle: temporary
createdAt: '2026-05-24T06:48:00.084Z'
updatedAt: '2026-05-24T06:48:00.084Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
## Goal

Implement Phase 3 in three streams: write-through to attached vaults (3a), cross-vault relationship traversal (3b), and Phase 2/3 tests (3c). Phase 2 is fully shipped.

## Apply note

Active checkpoint for Phase 3 implementation. Tracks sub-phase completion.

## Sub-phase checklist

### 3a.1: Type + config changes

- [ ] 1. Add `writable?: boolean` to `AttachmentRef`. Default false.
- [ ] 2. Add `pushBranch?: string` to `AttachmentRef`. Defaults to read branch.
- [ ] 3. Config schema migration: bump to "1.3", add migration for projectAttachments.
- [ ] 4. `loadAttachmentsForProject`: set `writable` getter based on `attachmentRef.writable === true`.

### 3a.2: AttachedStorage write enablement

- [ ] 5. Replace `AttachedVaultReadOnlyError` throws with conditional: if vault writable, delegate to baseStorage.
- [ ] 6. `writeEmbedding`/`writeProjection` already write to local cache, no change.
- [ ] 7. After write: commit via GitOps.commitWithStatus scoped to notes dir, push to pushBranch if configured.

### 3a.3: Vault routing changes

- [ ] 8. `searchOrderMutable` already uses writable filter. No change.
- [ ] 9. `allKnownVaultsMutable`: include writable attached vaults.
- [ ] 10. `findNote(mutable: true)` — verify double-lookup error messages correct for non-writable.

### 3a.4: Tool-level changes

- [ ] 11. `remember`: resolveWriteVault path for writable attachments.
- [ ] 12. `update`/`forget`: remove hard block for writable attached vaults.
- [ ] 13. `relate`/`unrelate`: allow mutable find for writable attached vaults.
- [ ] 14. `consolidate`: entry.vault.writable check already correct.
- [ ] 15. `move_memory`: allow source in writable attached vault.
- [ ] 16. `pushAfterMutation`: update mutationPushMode logic.

### 3a.5: Attachment tool updates

- [ ] 17. `add_attachment`: add writable and pushBranch params.
- [ ] 18. `list_attachments`: show writable and pushBranch.
- [ ] 19. `set_attachment_enabled`/`set_attachment_branch`: verify no changes needed.

### 3a.6: Sync + staleness

- [ ] 20. `sync`: writable attached vaults get push-after-sync.
- [ ] 21. After write-push, update branchTipHash in config.
- [ ] 22. After write, invalidate session cache for that vault.

### 3a.7: Error messages + docs

- [ ] 23. Update attachedVaultErrorMessage conditional.
- [ ] 24. Update tool descriptions.
- [ ] 25. AGENT.md, CHANGELOG.md updates.

### 3b: Cross-vault relationship traversal

- [ ] 26. Extend Relationship type with optional vaultPath.
- [ ] 27. Update validateRelatedTo to parse vaultPath.
- [ ] 28. Update note serialization/deserialization.
- [ ] 29. getDirectRelatedNotes: resolve vault-qualified IDs.
- [ ] 30. findNote: include target vault when vaultPath present.
- [ ] 31. memory_graph: relax visibleIds filter for cross-vault.
- [ ] 32. relate: store vaultPath for cross-vault relationships.
- [ ] 33. unrelate: handle cross-vault vaultPath.
- [ ] 34. removeRelationshipsToNoteIds: scan all vaults for dangling refs.
- [ ] 35. getRelationshipPreview: resolve vault-qualified IDs.
- [ ] 36. formatRelationshipPreview: show vault provenance.
- [ ] 37. Recall top-N relationship expansion.
- [ ] 38. auto-relate: consider cross-project candidates.

### 3c: Tests

- [ ] 39. Enable 6 skipped tests in mutation-error.integration.test.ts.
- [ ] 40. New tests for writable attached vault mutations.
- [ ] 41. Integration tests for cross-vault relate/unrelate.

## Commits

(To be filled as work progresses)
