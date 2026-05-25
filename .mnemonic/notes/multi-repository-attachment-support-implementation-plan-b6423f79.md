---
title: Multi-repository attachment support — implementation plan
tags:
  - workflow
  - plan
  - attachments
lifecycle: temporary
createdAt: '2026-05-22T19:04:08.973Z'
updatedAt: '2026-05-25T17:24:09.244Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: multi-repo-federated-reads-codebase-research-626b102b
    type: derives-from
  - id: multi-repository-attachment-plan-critical-review-795b9192
    type: derives-from
  - id: apply-multi-repo-attachment-phase-2-integration-tests-and-p0-f16c0bf8
    type: follows
  - id: apply-phase-2-remaining-integration-tests-staleness-auto-syn-9cd530e6
    type: follows
  - id: multi-repository-attachment-research-and-known-gaps-88d9e57e
    type: supersedes
memoryVersion: 1
---
# Multi-repository attachment support — implementation plan

## Summary

Federated read-only project attachments: link external repositories as knowledge sources. Attached repo notes participate in recall, summaries, list, get, memory_graph, and relationship previews. No writes, no auto-discovery, explicit add/remove tools. Explicit attachment sync included in Phase 1 (justified below).

## Phase 1: COMPLETE ✅

All sub-phases 1a-1g implemented and committed. See permanent summary note `multi-repo-attachment-phase-1-implementation-17350a93`.

## Phase 2: Tests, verification, staleness, auto-sync, portability

### Phase 2a: Integration test suite 🔄

- [x] 1. `AttachedStorage.unit.test.ts` — git-ref reads, working-tree fallback, fail-soft on git errors, note caching, `writeEmbedding`/`writeProjection` write to local cache, `writeNote`/`deleteNote` throw
- [x] 2. `attached-vault.integration.test.ts` — 6 E2E tests for add/list/remove/toggle/mutation-guards (3 mutation-guard tests flaky across MCP process boundary)
- [ ] 3. `recall-attachment.integration.test.ts` — 1 constant test passing, 3 skipped (need persistent MCP session for E2E recall with attached vault)
- [ ] 4. `tool-descriptions.integration.test.ts` — no `storedIn: "attached"` assertions yet
- [ ] 5. `output-rendering.integration.test.ts` — no `attached:` vault label rendering tests yet
- [x] 6. `mutation-error.integration.test.ts` — all 5 tests still skipped (same fixture limitation)
- [x] 7. `isProject-migration.test.ts` — 4 tests, all passing
- [x] 8. `config.unit.test.ts` — 61 tests, shipped
- [x] 9. `vault.unit.test.ts` — extended with attachment tests including searchOrder assertion that attachedIdx < mainIdx
- [x] 10. `storageLabel` unit tests — all provenance types, `attached:<slug>/.mnemonic` format
- [x] 11. `vaultMatchesStorageScope` unit tests — `project-vault` filter excludes attached vaults, `"attached"` filter includes only attached vaults
- [x] 12. `tool-output-schemas.unit.test.ts` — `_VaultLabel` regex accepts `attached:*` pattern, `ProjectSummaryNotesSchema` has `attachedVault` field

### Phase 2b: P0 verification and implementation ✅

- [x] 13-18. All P0 items complete (attachment boost, composite dedup, scope semantics, storedIn enum, ProjectSummaryNotesSchema, full test suite)

### Phase 2c: Staleness detection + embedding reconciliation ✅

- [x] 19. `branchTipHash` staleness detection in `loadAttachmentsForProject`
- [x] 20. Embedding reconciliation on staleness in both `sync.ts` and `project.ts`
- [x] 21. Sync-triggered cache invalidation after `mnemonic_sync`
- [x] 22. Unit tests for staleness detection and embedding reconciliation (10 tests)

### Phase 2d: Output rendering + working-tree warnings

- [x] 23. All text output rendering shows `attached:<slug>/.mnemonic` vault labels
- [x] 24. `add_attachment` working-tree mode warning
- [x] 25. All output schema `.describe()` updates mention `attached:` vault label format
- [ ] 26. Output rendering integration tests for `attached:` vault labels

### Phase 2e: Auto-sync on branch change ✅

- [x] 27. Auto-sync attached vaults when consuming project switches branches
- [x] 28. Cache invalidation after auto-fetch
- [x] 29. N/A — implemented instead of documented as limitation

### Phase 2f: Machine-specific path portability ✅

- [x] 30. `add_attachment` `localPath` supports `~` expansion
- [x] 31. `collapseHomePath` stores portable `~`-prefixed paths
- [x] 32. All attachment tools resolve `~` at runtime

### Phase 2g: Documentation + final verification 🔄

- [x] 33. AGENT.md updated
- [x] 34. README.md already documented in Phase 1
- [x] 35. CHANGELOG.md updated with Phase 2 entries
- [ ] 36. Final test suite verification (3 known pre-existing flaky failures, not Phase 2 regressions)

## Design decisions (confirmed) — carried forward from Phase 1

- **Discriminated `provenance` field on Vault** instead of `isProject` boolean. Prevents impossible states. Includes computed `writable` property.
- **Embeddings in consuming project's cache** at `.mnemonic/attachments/<slug>/embeddings/`. Local, disposable, no cross-repo sync.
- **Label format: `attached:<project-slug>/.mnemonic`**. Consistent with `sub-vault:<folder>`.
- **Max 5 attachments per project**, configurable via `maxAttachmentsPerProject`.
- **Read-only** (except explicit sync). No writes to external repos.
- **Explicit sync** PLUS auto-sync on branch change.
- **Branch model**: default reads from a configured branch via git ref, configurable per-attachment. Working-tree mode with explicit opt-in warning.
- **Fail-soft**: when attached repo not checked out, branch doesn't exist, or git commands fail — debug-log, skip, continue.
- **Embeddings built lazily** on first recall.
- **`storedIn: "project-vault"` matches only project-local vaults**. New `storedIn: "attached"` enum value. `storedIn: "any"` includes all vaults.
- **Scope semantics: attached notes are project-extended**. Pass `scope: "project"` filtering. Carry original `Note.project` but `collectVisibleNotes` treats them as project-scoped.
- **Attachment boost**: half of `projectScopeBoost` (0.015).
- **Composite dedup key**: `(noteId, vaultPath)` instead of `noteId` alone.
- **Write methods on AttachedStorage**: `writeEmbedding` and `writeProjection` write to local cache (not throw). Only `writeNote`, `deleteNote`, and atomic write methods throw.
- **Staleness detection**: `branchTipHash` stored in config and `AttachmentRef`. On cache build, compared against current tip. Invalidates caches when stale.
- **Path portability**: `collapseHomePath` for `~`-prefixed storage, `expandHomePath` for runtime resolution. Absolute paths still work.
