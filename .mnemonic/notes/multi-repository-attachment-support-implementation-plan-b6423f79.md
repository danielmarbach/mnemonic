---
title: Multi-repository attachment support — implementation plan
tags:
  - workflow
  - plan
  - attachments
lifecycle: temporary
createdAt: '2026-05-22T19:04:08.973Z'
updatedAt: '2026-05-23T12:24:20.899Z'
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
memoryVersion: 1
---
# Multi-repository attachment support — implementation plan

## Summary

Federated read-only project attachments: link external repositories as knowledge sources. Attached repo notes participate in recall, summaries, list, get, memory\_graph, and relationship previews. No writes, no auto-discovery, explicit add/remove tools. Explicit attachment sync included in Phase 1 (justified below).

## Phase 1: COMPLETE ✅

All sub-phases 1a-1g implemented and committed. See permanent summary note `multi-repo-attachment-phase-1-implementation-17350a93`.

## Phase 2: Tests, verification, staleness, auto-sync, portability

### Phase 2a: Integration test suite

- [ ] 1. `AttachedStorage.unit.test.ts` — git-ref reads, working-tree fallback, fail-soft on git errors, note caching, `writeEmbedding`/`writeProjection` write to local cache, `writeNote`/`deleteNote` throw
- [ ] 2. `attached-vault.integration.test.ts` — comprehensive end-to-end test fixture:
  - `add_attachment` with default branch auto-detection via `git symbolic-ref`
  - `add_attachment` with explicit branch
  - `add_attachment` rejects invalid path, missing notes dir, same repo, count > max, no `origin` remote
  - `add_attachment` warns on working-tree mode (`branch: ""`)
  - `list_attachments` shows enabled status, branch, path-exists, note count
  - `set_attachment_enabled` toggles without removing config
  - `set_attachment_branch` changes branch; notes update accordingly; `branchTipHash` updates
  - `remove_attachment` removes config, cleans up embeddings dir
  - `recall` returns notes from attached repo with `attached:<slug>/.mnemonic` label
  - `recall` includes attached notes with `scope: "project"` (attachment-extended)
  - `recall` includes attached notes with `scope: "all"`
  - `recall` excludes attached notes with `scope: "global"`
  - `project_memory_summary` includes attached notes in themes when `scope: "all"`, `attachedVault` count correct
  - `list` shows attached notes with correct vault label
  - `list` with `storedIn: "attached"` shows only attached vault notes
  - `list` with `storedIn: "project-vault"` excludes attached vault notes
  - `get` resolves note from attached vault
  - `memory_graph` nodes include attached vault provenance
  - `recent_memories` includes attached notes
  - `where_is_memory` shows attached vault label, notes read-only status
  - `discover_tags` includes tags from attached vaults, counts vaults correctly
  - `detect_project` shows attachment count and status
  - `sync` explicitly syncs attached vaults via `git fetch`, updates `branchTipHash`
  - `sync` triggers cache invalidation for attached vaults
  - Fail-soft when attached path doesn't exist (notes absent)
  - Fail-soft when branch doesn't exist on attached repo
  - Fail-soft when git commands fail (notes absent for that vault)
  - Composite dedup: notes with same ID in different repos both surface with vault disambiguation
  - Max attachment count enforcement
  - Embeddings written to consuming project's `.mnemonic/attachments/<slug>/embeddings/`
  - Projections written to consuming project's `.mnemonic/attachments/<slug>/projections/`
  - Consolidate never touches attached vault notes
  - Forget never touches attached vault notes (uses `allKnownVaultsMutable`)
  - Relate/unrelate never modify attached vault notes (uses `allKnownVaultsMutable`)
  - Remember/update/move_memory return specific error for attached note IDs (not generic "not found")
  - Working-tree mode (`branch: ""`) reads from filesystem, warning issued
  - Attachment boost scoring: attached notes score between project-local and global notes
  - `ProjectSummaryNotesSchema.attachedVault` count correct
  - `removeRelationshipsToNoteIds` skips attached vaults
  - `pushAfterMutation` skips attached vaults
- [ ] 3. `recall-pipeline.integration.test.ts` — attached vault notes score/rank correctly with attachment boost, dedup by composite key
- [ ] 4. `tool-descriptions.integration.test.ts` — new tool descriptions match schema, existing tool descriptions updated for `storedIn: "attached"` and vault label formats
- [ ] 5. `output-rendering.integration.test.ts` — text output for `attached:<slug>/.mnemonic` vault labels in recall, list, get, where_is_memory, recent_memories, project_memory_summary, memory_graph
- [ ] 6. `mutation-error.integration.test.ts` — specific error messages when attempting to mutate attached vault notes (update, forget, move_memory, relate, unrelate, consolidate)
- [ ] 7. `isProject-migration.test.ts` — verify all former `isProject` call sites correctly use `provenance` or `writable`
- [ ] 8. `config.unit.test.ts` — attachment config parsing, normalization, count validation, max cap, branch validation, schema migration from 1.1 to 1.2
- [ ] 9. `vault.unit.test.ts` — VaultProvenance discrimination, `writable` computed property, attachment vault creation, search order with/without attachments, `allKnownVaults` vs `allKnownVaultsMutable`, `searchOrder` vs `searchOrderMutable`, `findNote` with `mutable: true` excludes attached vault notes
- [ ] 10. `storageLabel` unit tests — all provenance types, `attached:<slug>/.mnemonic` format
- [ ] 11. `vaultMatchesStorageScope` unit tests — `project-vault` filter excludes attached vaults, `"attached"` filter includes only attached vaults
- [ ] 12. `tool-output-schemas.unit.test.ts` — `_VaultLabel` regex accepts `attached:*` pattern, `ProjectSummaryNotesSchema` has `attachedVault` field

### Phase 2b: P0 verification and implementation

- [ ] 13. Verify/implement recall attachment boost: `ATTACHMENT_BOOST = PROJECT_SCOPE_BOOST / 2 = 0.015` applied to notes from `provenance === "project-attached"` vaults
- [ ] 14. Verify/implement `collectVisibleNotes` composite dedup key `(noteId, vaultPath)` instead of `noteId` alone
- [ ] 15. Verify/implement `scope: "project"` attachment-extended semantics: attached notes pass `scope: "project"` filtering because explicitly attached
- [ ] 16. Verify/implement `storedIn: "attached"` enum value in `StorageScope` and `vaultMatchesStorageScope`
- [ ] 17. Verify/implement `ProjectSummaryNotesSchema.attachedVault` count field
- [ ] 18. Run full test suite to confirm no regressions (should be >926 tests)

### Phase 2c: Staleness detection + embedding reconciliation

- [ ] 19. `branchTipHash` staleness detection: on cache build, compare `attachmentRef.branchTipHash` against `git rev-parse <branch>`; invalidate caches and update hash when stale
- [ ] 20. Embedding reconciliation on staleness: when branch tip changes, identify deleted/changed notes, remove stale embeddings, mark for re-embedding
- [ ] 21. Sync-triggered cache invalidation: after `mnemonic_sync` for attached vault, call `invalidateActiveProjectCache()` or targeted `invalidateAttachedVaultCaches()`
- [ ] 22. Unit tests for staleness detection and embedding reconciliation

### Phase 2d: Output rendering + working-tree warnings

- [ ] 23. Verify all text output rendering shows `attached:<slug>/.mnemonic` vault labels correctly (recall, list, get, where_is_memory, recent_memories, project_memory_summary, memory_graph, remember)
- [ ] 24. `add_attachment` working-tree mode warning: when `branch: ""`, return warning that working-tree mode reads uncommitted content with no audit trail
- [ ] 25. Verify all output schema `.describe()` updates mention `attached:` vault label format
- [ ] 26. Output rendering integration tests for `attached:` vault labels

### Phase 2e: Auto-sync on branch change

- [ ] 27. Auto-sync attached vaults when consuming project switches branches (investigate feasibility — this was explicitly deferred from Phase 1)
- [ ] 28. If feasible: detect branch change in `ensureBranchSynced` for attached vaults, refresh cache
- [ ] 29. If not feasible: document limitation and recommend explicit `sync` after branch switches

### Phase 2f: Machine-specific path portability

- [ ] 30. Investigate config portability: machine-specific `localPath` means attachment configs don't port across machines
- [ ] 31. Evaluate options: relative paths, `~` expansion, auto-detection of known repos, SSH config
- [ ] 32. Implement chosen solution or document as known limitation with workaround

### Phase 2g: Documentation + final verification

- [ ] 33. Update AGENT.md with any new Phase 2 features (auto-sync, path portability)
- [ ] 34. Update README.md with Phase 2 additions
- [ ] 35. Update CHANGELOG.md with Phase 2 entry
- [ ] 36. Run full test suite final time to confirm no regressions

## Design decisions (confirmed) — carried forward from Phase 1

- **Discriminated `provenance` field on Vault** instead of `isProject` boolean. Prevents impossible states. Includes computed `writable` property for write-ability checks.
- **Embeddings in consuming project's cache** at `.mnemonic/attachments/<slug>/embeddings/`. Local, disposable, no cross-repo sync. Explicitly gitignored.
- **Label format: `attached:<project-slug>/.mnemonic`**. Consistent with `sub-vault:<folder>`.
- **Max 5 attachments per project**, configurable via `maxAttachmentsPerProject` config field (default 5).
- **Read-only** (except explicit sync). No writes to external repos. Consolidate and prune never touch attached vaults.
- **Explicit sync for attachments**. Justification: without sync, attached repos become stale. Scope: explicit tool call only, no auto-sync on branch change (Phase 2e investigates this).
- **Branch model**: default reads from a configured branch via git ref, configurable per-attachment. Working-tree mode as escape hatch with explicit opt-in warning.
- **Fail-soft**: when attached repo not checked out, branch doesn't exist, or git commands fail — debug-log, skip that vault's notes, continue with others.
- **Embeddings built lazily** on first recall, consistent with existing same-repo vault behavior.
- **`storedIn: "project-vault"` matches only project-local vaults**. New `storedIn: "attached"` enum value for filtering attached-only. `storedIn: "any"` includes all vaults.
- **Scope semantics: attached notes are project-extended**. Attached notes pass `scope: "project"` filtering because they are explicitly attached by the user. They carry their original `Note.project` but `collectVisibleNotes` treats them as project-scoped for the consuming project.
- **Attachment boost**: attached notes receive half of `projectScopeBoost` (0.015) to reflect explicit user intent while keeping project-local notes ranked higher.
- **Composite dedup key**: `(noteId, vaultPath)` instead of `noteId` alone, preventing cross-repo collisions.
- **Write methods on AttachedStorage**: `writeEmbedding` and `writeProjection` write to local cache (not throw). Only `writeNote`, `deleteNote`, and atomic write methods throw (read-only mutations).
- **Staleness detection**: `branchTipHash` stored in config and `AttachmentRef`. On cache build, compared against current tip. Invalidates caches when stale.
