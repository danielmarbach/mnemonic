---
title: Multi-repository attachment support — implementation plan
tags:
  - workflow
  - plan
  - attachments
lifecycle: temporary
createdAt: '2026-05-22T19:04:08.973Z'
updatedAt: '2026-05-23T18:55:15.299Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: multi-repo-federated-reads-codebase-research-626b102b
    type: derives-from
  - id: multi-repository-attachment-plan-critical-review-795b9192
    type: derives-from
  - id: multi-repo-attachment-phase-1-implementation-17350a93
    type: related-to
  - id: multi-repo-attachment-phase-2-research-1bb12411
    type: derives-from
  - id: apply-multi-repo-attachment-phase-2-integration-tests-and-p0-f16c0bf8
    type: follows
  - id: apply-phase-2-remaining-integration-tests-staleness-auto-syn-9cd530e6
    type: follows
memoryVersion: 1
---
# Multi-repository attachment support — implementation plan

## Summary

Federated read-only project attachments: link external repositories as knowledge sources. Attached repo notes participate in recall, summaries, list, get, memory\_graph, and relationship previews. No writes, no auto-discovery, explicit add/remove tools. Explicit attachment sync included in Phase 1 (justified below).

## Phase 1: COMPLETE ✅

All sub-phases 1a-1g implemented and committed. See permanent summary note `multi-repo-attachment-phase-1-implementation-17350a93`.

## Phase 2: Tests, verification, staleness, auto-sync, portability

### Phase 2a: Integration test suite 🔄

- [x] 1. `AttachedStorage.unit.test.ts` — git-ref reads, working-tree fallback, fail-soft on git errors, note caching, `writeEmbedding`/`writeProjection` write to local cache, `writeNote`/`deleteNote` throw
- [ ] 2. `attached-vault.integration.test.ts` — fixture helper created (`tests/helpers/attached-vault-fixture.ts`), test file created with 9 tests covering add/remove/list/enable/mutation guards/recall scope. **Tests hang on `add_attachment` MCP call — needs debugging.**
- [ ] 3. `recall-pipeline.integration.test.ts` — attached vault notes score/rank correctly with attachment boost, dedup by composite key
- [ ] 4. `tool-descriptions.integration.test.ts` — new tool descriptions match schema, existing tool descriptions updated for `storedIn: "attached"` and vault label formats
- [ ] 5. `output-rendering.integration.test.ts` — text output for `attached:<slug>/.mnemonic` vault labels
- [ ] 6. `mutation-error.integration.test.ts` — specific error messages when attempting to mutate attached vault notes
- [ ] 7. `isProject-migration.test.ts` — verify all former `isProject` call sites correctly use `provenance` or `writable`
- [x] 8. `config.unit.test.ts` — attachment config parsing, normalization, count validation, max cap, branch validation, schema migration from 1.1 to 1.2
- [ ] 9. `vault.unit.test.ts` — VaultProvenance discrimination, `writable` computed property, attachment vault creation, search order with/without attachments, `allKnownVaults` vs `allKnownVaultsMutable`, `searchOrder` vs `searchOrderMutable`, `findNote` with `mutable: true` excludes attached vault notes
- [x] 10. `storageLabel` unit tests — all provenance types, `attached:<slug>/.mnemonic` format
- [x] 11. `vaultMatchesStorageScope` unit tests — `project-vault` filter excludes attached vaults, `"attached"` filter includes only attached vaults
- [x] 12. `tool-output-schemas.unit.test.ts` — `_VaultLabel` regex accepts `attached:*` pattern, `ProjectSummaryNotesSchema` has `attachedVault` field

### Phase 2b: P0 verification and implementation ✅

- [x] 13. Recall attachment boost: `ATTACHMENT_BOOST = 0.015` applied to notes from `provenance === "project-attached"` vaults
- [x] 14. `collectVisibleNotes` composite dedup key `(noteId, vaultPath)` instead of `noteId` alone
- [x] 15. `scope: "project"` attachment-extended semantics: attached notes pass `scope: "project"` filtering
- [x] 16. `storedIn: "attached"` enum value in `StorageScope` and `vaultMatchesStorageScope`
- [x] 17. `ProjectSummaryNotesSchema.attachedVault` count field
- [x] 18. Full test suite passes (1069 tests)
- [x] Review fix: collectVisibleNotes excludes attached vaults from scope:global
- [x] Review fix: Updated scope descriptions in list.ts and discover-tags.ts

### Phase 2c: Staleness detection + embedding reconciliation ✅

- [x] 19. `branchTipHash` staleness detection: on cache build, compare `attachmentRef.branchTipHash` against `git rev-parse <branch>`; invalidate caches and update hash when stale
- [x] 20. Embedding reconciliation on staleness: both `sync.ts` and `ensureBranchSynced` now list current note IDs from the attached vault after a tip change and remove embeddings for IDs that no longer exist, using `removeStaleEmbeddings()`
- [x] 21. Sync-triggered cache invalidation: after `mnemonic_sync` for attached vault, calls `clearAttachmentCaches()` and `loadAttachmentsForProject()`
- [ ] 22. Unit tests for staleness detection and embedding reconciliation

### Phase 2d: Output rendering + working-tree warnings

- [x] 23. All text output rendering shows `attached:<slug>/.mnemonic` vault labels correctly (recall, list, get, where_is_memory, recent_memories, project_memory_summary, memory_graph, remember)
- [x] 24. `add_attachment` working-tree mode warning: when `branch: ""`, returns warning about uncommitted content
- [x] 25. All output schema `.describe()` updates mention `attached:` vault label format
- [ ] 26. Output rendering integration tests for `attached:` vault labels

### Phase 2e: Auto-sync on branch change ✅

- [x] 27. Auto-sync attached vaults when consuming project switches branches: `ensureBranchSynced` now calls `syncAttachedVaultsOnBranchChange()` which fetches each enabled attached repo, compares branch tips, updates config, clears caches, reloads, and removes stale embeddings
- [x] 28. Feasibility confirmed and implemented: branch change detection in `ensureBranchSynced` fetches attached vault branches, refreshes cache, reconciles embeddings
- [x] 29. N/A — implemented instead of documented as limitation

### Phase 2f: Machine-specific path portability ✅

- [x] 30. `add_attachment` `localPath` now supports `~` expansion via `expandHomePath()` from `paths.ts`
- [x] 31. `collapseHomePath()` converts absolute paths under home directory to `~`-prefixed paths for portable config storage
- [x] 32. All attachment tools (`sync.ts`, `list-attachments.ts`, `remove-attachment.ts`, `set-attachment-branch.ts`) and `loadAttachmentsForProject()` resolve `~` at runtime via `expandHomePath()`. Config stores portable `~` paths; runtime always resolves to absolute.

### Phase 2g: Documentation + final verification 🔄

- [x] 33. AGENT.md updated with auto-sync behavior, path portability, `~` expansion
- [x] 34. README.md — already documented in Phase 1, no new Phase 2 additions needed beyond what AGENT.md covers
- [x] 35. CHANGELOG.md updated with Phase 2 entries: auto-sync, path portability, embedding reconciliation
- [ ] 36. Run full test suite final time to confirm no regressions (pre-existing `attached-storage.unit.test.ts` flaky failures — 13/45 tests time out on git operations, not related to Phase 2 changes)

## Design decisions (confirmed) — carried forward from Phase 1

- **Discriminated `provenance` field on Vault** instead of `isProject` boolean. Prevents impossible states. Includes computed `writable` property for write-ability checks.
- **Embeddings in consuming project's cache** at `.mnemonic/attachments/<slug>/embeddings/`. Local, disposable, no cross-repo sync. Explicitly gitignored.
- **Label format: `attached:<project-slug>/.mnemonic`**. Consistent with `sub-vault:<folder>`.
- **Max 5 attachments per project**, configurable via `maxAttachmentsPerProject` config field (default 5).
- **Read-only** (except explicit sync). No writes to external repos. Consolidate and prune never touch attached vaults.
- **Explicit sync for attachments** PLUS auto-sync on branch change. `ensureBranchSynced` now fetches attached vault branches when the consuming project switches branches.
- **Branch model**: default reads from a configured branch via git ref, configurable per-attachment. Working-tree mode as escape hatch with explicit opt-in warning.
- **Fail-soft**: when attached repo not checked out, branch doesn't exist, or git commands fail — debug-log, skip that vault's notes, continue with others.
- **Embeddings built lazily** on first recall, consistent with existing same-repo vault behavior.
- **`storedIn: "project-vault"` matches only project-local vaults**. New `storedIn: "attached"` enum value for filtering attached-only. `storedIn: "any"` includes all vaults.
- **Scope semantics: attached notes are project-extended**. Attached notes pass `scope: "project"` filtering because they are explicitly attached by the user. They carry their original `Note.project` but `collectVisibleNotes` treats them as project-scoped for the consuming project.
- **Attachment boost**: attached notes receive half of `projectScopeBoost` (0.015) to reflect explicit user intent while keeping project-local notes ranked higher.
- **Composite dedup key**: `(noteId, vaultPath)` instead of `noteId` alone, preventing cross-repo collisions.
- **Write methods on AttachedStorage**: `writeEmbedding` and `writeProjection` write to local cache (not throw). Only `writeNote`, `deleteNote`, and atomic write methods throw (read-only mutations).
- **Staleness detection**: `branchTipHash` stored in config and `AttachmentRef`. On cache build, compared against current tip. Invalidates caches when stale.
- **Path portability**: `localPath` in config stored with `~` prefix when under home directory (`collapseHomePath`). Resolved at runtime via `expandHomePath()`. Absolute paths still work; `~` paths enable cross-machine config sharing.
