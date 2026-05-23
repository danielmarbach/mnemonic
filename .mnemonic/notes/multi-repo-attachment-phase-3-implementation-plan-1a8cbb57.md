---
title: Multi-repo attachment Phase 3 — implementation plan
tags:
  - workflow
  - plan
  - attachments
  - phase3
lifecycle: temporary
createdAt: '2026-05-23T21:43:11.965Z'
updatedAt: '2026-05-23T21:43:21.122Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: multi-repo-attachment-phase-3-request-root-58d643a2
    type: derives-from
memoryVersion: 1
---
# Multi-repo attachment Phase 3 — implementation plan

## Goal

Three work streams for Phase 3: write-through to attached vaults, cross-vault relationship traversal, and Phase 2 residual tests.

## Phase 3a: Write-through to attached vaults

### 3a.1: Type + config changes

- [ ] 1. Add `writable?: boolean` to `AttachmentRef` (src/vault.ts ~line 24-34). Default `false`. When `true`, `Vault.writable` returns `true` for attached vaults with this flag.
- [ ] 2. Add `pushBranch?: string` to `AttachmentRef`. Branch to push mutations to. Defaults to the read `branch`. If empty string, commits locally but no push.
- [ ] 3. Config schema migration: bump to `"1.3"`, add migration for `projectAttachments` entries (add `writable: false`, `pushBranch` defaults).
- [ ] 4. `loadAttachmentsForProject`: when building attached vaults, set `writable` getter based on `attachmentRef.writable === true`.

### 3a.2: AttachedStorage write enablement

- [ ] 5. Replace `AttachedVaultReadOnlyError` throws in `writeNote`, `deleteNote`, atomic write methods with conditional: if vault writable, delegate to `baseStorage` (writes to local checkout). If not writable, throw as before.
- [ ] 6. `writeEmbedding`/`writeProjection` — already write to local cache, no change needed.
- [ ] 7. After write: commit via `GitOps.commitWithStatus()` scoped to notes dir. Then push to `pushBranch` if configured.

### 3a.3: Vault routing changes

- [ ] 8. `searchOrderMutable` — already uses `vault.writable` filter. No code change needed; writable attached vaults automatically included.
- [ ] 9. `allKnownVaultsMutable` — currently excludes attached vaults entirely (vault.ts:163-169). Add writable attached vaults: iterate `this.attachedVaults` and include those where `vault.writable === true`.
- [ ] 10. `findNote(mutable: true)` — will automatically find notes in writable attached vaults. Verify double-lookup error path still produces correct messages for non-writable attached vaults.

### 3a.4: Tool-level changes

- [ ] 11. `remember`: `resolveWriteVault()` needs new path — if `scope: "project"` and writable attachment specified via new `storedIn` or `attachmentSlug` param, resolve to that attached vault. Otherwise current behavior.
- [ ] 12. `update`/`forget`: Remove hard block for attached vault notes when `vault.writable`. Keep error for non-writable attached vaults.
- [ ] 13. `relate`/`unrelate`: Allow mutable find for notes in writable attached vaults. Keep error for non-writable.
- [ ] 14. `consolidate`: `entry.vault.writable` check already correct — will allow writable attached vault entries.
- [ ] 15. `move_memory`: Allow source note in writable attached vault. Target can be writable attached vault too.
- [ ] 16. `pushAfterMutation`: Update `mutationPushMode` logic — `"all"` pushes writable attached vaults. `"main-only"` skips attached. `"none"` skips all.

### 3a.5: Attachment tool updates

- [ ] 17. `add_attachment`: Add `writable?: boolean` param (default false). Add `pushBranch?: string` param.
- [ ] 18. `list_attachments`: Show `writable` and `pushBranch` in output.
- [ ] 19. `set_attachment_enabled`/`set_attachment_branch`: No changes needed for write-through, but verify they work with writable flag.

### 3a.6: Sync + staleness updates

- [ ] 20. `sync`: Writable attached vaults get push-after-sync when `mutationPushMode === "all"`.
- [ ] 21. Staleness detection: after write-push, update `branchTipHash` in config to prevent spurious invalidation.
- [ ] 22. Cache invalidation: after write to attached vault, invalidate session cache for that vault.

### 3a.7: Error messages + documentation

- [ ] 23. Update `attachedVaultErrorMessage` to be conditional: if vault writable, no error. If not writable, existing error.
- [ ] 24. Update tool descriptions: mention writable attachments in remember, update, forget, relate, unrelate.
- [ ] 25. AGENT.md, README.md, CHANGELOG.md updates.

## Phase 3b: Cross-vault relationship traversal

### 3b.1: Vault-qualified relationship schema

- [ ] 26. Extend `Relationship` type (src/storage.ts:29-32): add optional `vaultPath?: string` field. When present, indicates cross-vault relationship. When absent, same-vault (backward compatible).
- [ ] 27. Update `validateRelatedTo` (src/validation.ts:38-56): parse `vaultPath` field, default to `undefined`.
- [ ] 28. Update note serialization/deserialization in Storage: write `vaultPath` when present.

### 3b.2: Cross-vault resolution

- [ ] 29. `getDirectRelatedNotes` (src/relationships.ts:150-198): when resolving a `relatedId`, if `vaultPath` is present, search that specific vault first. If not found, fall back to flat map lookup (backward compat).
- [ ] 30. `findNote`: when `Relationship.vaultPath` present, include target vault in search order if not already there.
- [ ] 31. `memory_graph` (src/tools/memory-graph.ts:62): relax `visibleIds.has(rel.id)` filter — resolve cross-vault IDs even when target note not in current visible set. Add to visible set dynamically.

### 3b.3: relate/unrelate cross-vault

- [ ] 32. `relate`: When `fromNote` and `toNote` are in different vaults, store `vaultPath` in each relationship entry pointing to the other vault.
- [ ] 33. `unrelate`: Handle cross-vault vaultPath in filter logic.
- [ ] 34. `removeRelationshipsToNoteIds` (forget cleanup): scan ALL vaults including attached (read-only) for dangling references. Only write to writable vaults. Log warning for unresolvable dangling refs in non-writable vaults.

### 3b.4: Relationship previews cross-vault

- [ ] 35. `getRelationshipPreview` (src/relationships.ts:254-265): resolve vault-qualified IDs across vault boundaries. Include vault label in preview for cross-vault relationships.
- [ ] 36. `formatRelationshipPreview`: show vault provenance for cross-vault edges, e.g., `title (id) [related-to, attached:other-project/.mnemonic]`.
- [ ] 37. Recall top-N relationship expansion: resolve cross-vault relationships in enriched previews.

### 3b.5: Auto-relate consideration

- [ ] 38. `auto-relate.ts`: currently scoped to `candidate.note.project === source.project`. For writable attached vaults, consider cross-project candidates when both vaults are visible.

## Phase 3c: Phase 2 residual tests (now write-through scope)

- [ ] 39. Enable 6 skipped tests in `mutation-error.integration.test.ts` — update to test writable attached vault mutation errors (attempt to write to non-writable attached vault should still error).
- [ ] 40. Add new tests for writable attached vault mutations: remember, update, forget, relate to writable attached vault.
- [ ] 41. Integration tests for cross-vault relate/unrelate (notes in different vaults).

## Constraints

- No new I/O on cold paths (write paths only trigger on explicit tool calls)
- Fail-soft to undefined (non-writable attached vault errors are explicit, not crashes)
- Session cache reuse (invalidate only on mutation)
- Explicit enablement (writable flag default false)
- Backward compatible (vaultPath optional, bare MemoryIds still work)
- Git commit scoping (only .mnemonic/ paths committed in attached repos)
- No third-party dependencies

## Dependency order

3a (write-through) ships first. 3b (cross-vault relationships) builds on writable vaults. 3c (tests) validates both.

## Risks

| Risk | Mitigation |
| --- | --- |
| Git push to external repo fails (auth, conflicts) | Fail-soft: commit locally, warn on push failure. Retry via sync tool. |
| Branch conflicts when pushing to read branch | `pushBranch` config allows targeting feature branch. Default = read branch with warning. |
| Stale reads after write | Update `branchTipHash` post-write. Invalidate session cache. |
| Cross-vault relationship dangling refs | Best-effort resolution. Unresolvable refs shown as `[unresolved: id]` in previews. |
| Composite dedup with vault-qualified IDs | Existing `(noteId, vaultPath)` dedup already handles this. |
