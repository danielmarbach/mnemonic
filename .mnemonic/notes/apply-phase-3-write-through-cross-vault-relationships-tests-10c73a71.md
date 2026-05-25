---
title: 'Apply: Phase 3 — write-through, cross-vault relationships, tests'
tags:
  - workflow
  - apply
  - attachments
  - phase3
lifecycle: temporary
createdAt: '2026-05-24T06:48:00.084Z'
updatedAt: '2026-05-24T12:11:46.737Z'
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

### 3a.1: Type + config changes (COMMITTED 0aa1fef)

- \[x] 1. Add `writable?: boolean` to `AttachmentRef`. Default false.
- \[x] 2. Add `pushBranch?: string` to `AttachmentRef`. Defaults to read branch.
- \[x] 3. Config schema migration: bump to "1.3".
- \[x] 4. `loadAttachmentsForProject`: set `writable` getter based on `config.writable === true`.

### 3a.2: AttachedStorage write enablement (COMMITTED 57320ff)

- \[x] 5. Replace `AttachedVaultReadOnlyError` throws with conditional: if vault writable, delegate to baseStorage.
- \[x] 6. `writeEmbedding`/`writeProjection` already write to local cache, no change.
- \[x] 7. After write: commit via GitOps.commitWithStatus scoped to notes dir. pushBranch handled in pushAfterMutation.

- `1ce2024` feat: cross-vault relationship traversal (3b)
- `b84c7a4` test: update config schema version to 1.3 and add writable/pushBranch fields

### 3a.3: Vault routing changes (COMMITTED bfaf376)

- \[x] 8. `searchOrderMutable` already uses writable filter. No change.
- \[x] 9. `allKnownVaultsMutable`: include writable attached vaults.
- \[x] 10. `findNote(mutable: true)` works correctly — writable attached vaults appear in searchOrderMutable.

### 3a.4: Tool-level changes (COMMITTED 57320ff + bfaf376)

- \[x] 11. resolveWriteVault: tools find writable attached vaults via findNote({ mutable: true })
- \[x] 12. `update`/`forget`: no inline changes needed — findNote({ mutable: true }) already works with writable attached vaults. Error messages preserved for non-writable.
- \[x] 13. `relate`/`unrelate`: same mechanism.
- \[x] 14. `consolidate`: entry.vault.writable check already correct.
- \[x] 15. `move_memory`: error message updated for non-writable case.
- \[x] 16. `pushAfterMutation`: updated — "all" mode pushes writable attached vaults via pushBranch; "main-only" skips attached vaults.

### 3a.5: Attachment tool updates (COMMITTED bfaf376)

- \[x] 17. `add_attachment`: writable and pushBranch params added.

- \[x] 18. `list_attachments`: writable and pushBranch shown in output.

- \[x] 19. `set_attachment_enabled`/`set_attachment_branch`: no changes needed — they operate on ProjectAttachmentConfig which already has writable/pushBranch fields preserved through round-trip.

- \[x] 20. sync push for writable attached vaults.

- \[ ] 21. branchTipHash update post-write.

- \[ ] 22. Cache invalidation.

- \[ ] 20. `sync`: writable attached vaults get push-after-sync via existing sync + pushAfterMutation integration.

- \[ ] 21. After write-push, update branchTipHash in config.

- \[ ] 22. After write, invalidate session cache that vault.

### 3a.7: Error messages + docs

- \[ ] 23. Update attachedVaultErrorMessage conditional.
- \[ ] 24. Update tool descriptions.
- \[ ] 25. AGENT.md, CHANGELOG.md updates.

### 3b: Cross-vault relationship traversal (COMMITTED 1ce2024)

- \[x] 26. Relationship type vaultPath field.

- \[x] 27. validateRelatedTo parses vaultPath.

- \[x] 28. Note serialization preserves vaultPath.

- \[x] 29. getDirectRelatedNotes resolves vault-qualified IDs.

- \[x] 32. relate stores vaultPath for cross-vault.

- \[x] 33. unrelate handles vaultPath.

- \[x] 31. memory\_graph relaxes visibleIds filter for cross-vault.

- \[ ] 34. removeRelationshipsToNoteIds cross-vault scan (deferred).

- \[ ] 35-38. Relationship previews cross-vault (deferred).

- \[ ] 26. Extend Relationship type with optional vaultPath.

- \[ ] 27. Update validateRelatedTo to parse vaultPath.

- \[ ] 28. Update note serialization/deserialization.

- \[ ] 29. getDirectRelatedNotes: resolve vault-qualified IDs.

- \[ ] 30. findNote: include target vault when vaultPath present.

- \[ ] 31. memory\_graph: relax visibleIds filter for cross-vault.

- \[ ] 32. relate: store vaultPath for cross-vault relationships.

- \[ ] 33. unrelate: handle cross-vault vaultPath.

- \[ ] 34. removeRelationshipsToNoteIds: scan all vaults for dangling refs.

- \[ ] 35. getRelationshipPreview: resolve vault-qualified IDs.

- \[ ] 36. formatRelationshipPreview: show vault provenance.

- \[ ] 37. Recall top-N relationship expansion.

- \[ ] 38. auto-relate: consider cross-project candidates.

### 3c: Tests

- \[ ] 39. Enable 6 skipped tests in mutation-error.integration.test.ts.

- \[ ] 40. New tests for writable attached vault mutations.

- \[ ] 41. Integration tests for cross-vault relate/unrelate.

- `0aa1fef` feat: add writable and pushBranch to AttachmentRef and config (3a.1)

- `57320ff` feat: enable write-through to attached vaults (3a.2-3a.4: AttachedStorage, pushAfterMutation, GitOps.pushBranch)

- `bfaf376` feat: add writable/pushBranch to attachment tools and vault routing (3a.3-3a.5: allKnownVaultsMutable, add\_attachment, list\_attachments, schemas)

- `0aa1fef` feat: add writable and pushBranch to AttachmentRef and config (3a.1)

- `57320ff` feat: enable write-through to attached vaults (3a.2-3a.4: AttachedStorage, pushAfterMutation, GitOps.pushBranch)

- `bfaf376` feat: add writable/pushBranch to attachment tools and vault routing (3a.3-3a.5: allKnownVaultsMutable, add\_attachment, list\_attachments, schemas)
