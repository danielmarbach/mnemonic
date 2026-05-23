---
title: Multi-repo attachment — Phase 1 implementation
tags:
  - workflow
  - apply
  - attachments
lifecycle: temporary
createdAt: '2026-05-23T10:54:18.672Z'
updatedAt: '2026-05-23T11:24:11.071Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
# Multi-repo attachment — Phase 1 implementation

## Status: In Progress

Implementing Phase 1 of the multi-repository attachment plan. Phases 1a through 1g.

Phase 1a: Type migration ✅

- \[x] 1. Define `VaultProvenance`, `AttachmentRef`, `ProjectAttachmentConfig` types; add `StorageScope: "attached"` value
- \[x] 2. Add `writable` computed property to `Vault` interface
- \[x] 3. Convert all `Vault.isProject` → `Vault.provenance` / `Vault.writable` across ALL call sites
- \[x] 4. Run full test suite to confirm no regressions (926 tests pass)

Commit: d77f6d6

- \[ ] 1. Define `VaultProvenance`, `AttachmentRef`, `ProjectAttachmentConfig` types; add `StorageScope: "attached"` value
- \[ ] 2. Add `writable` computed property to `Vault` interface
- \[ ] 3. Convert all `Vault.isProject` → `Vault.provenance` / `Vault.writable` across ALL call sites
- \[ ] 4. Run full test suite to confirm no regressions

Phase 1b: Config + VaultManager 🔄

- \[ ] 5. Config: extend `MnemonicConfig` with `projectAttachments`, `maxAttachmentsPerProject`
- \[ ] 6. Config normalization: `normalizeProjectAttachments()` in config.ts
- \[ ] 7. Config schema migration: bump `schemaVersion` to "1.2", add migration in `migration.ts`
- \[ ] 8. Expose `maxAttachmentsPerProject` via `get_project_memory_policy` / `set_project_memory_policy`
- \[ ] 9. VaultManager: `attachedVaults` map, `attachmentConfigs` map
- \[ ] 10. VaultManager: `loadAttachmentsForProject`, `getAttachmentsConfig`, `addAttachmentConfig`, `removeAttachmentConfig`, `setAttachmentEnabled`, `setAttachmentBranch`

- \[ ] 5. Config: extend `MnemonicConfig` with `projectAttachments`, `maxAttachmentsPerProject`
- \[ ] 6. Config normalization: `normalizeProjectAttachments()` in config.ts
- \[ ] 7. Config schema migration: bump `schemaVersion` to "1.2", add migration in `migration.ts`
- \[ ] 8. Expose `maxAttachmentsPerProject` via `get_project_memory_policy` / `set_project_memory_policy`
- \[ ] 9. VaultManager: `attachedVaults` map, `attachmentConfigs` map
- \[ ] 10. VaultManager: `loadAttachmentsForProject`, `getAttachmentsConfig`, `addAttachmentConfig`, `removeAttachmentConfig`, `setAttachmentEnabled`, `setAttachmentBranch`

## Phase 1c: Storage layer

- \[ ] 11. `AttachedStorage` class
- \[ ] 12. Git command helpers
- \[ ] 13. Embeddings/projections path
- \[ ] 14. Gitignore: add `attachments/`
- \[ ] 15. Staleness detection

## Phase 1d: Vault routing

- \[ ] 16-31. Search order, mutable routing, storage labels, scope filtering, dedup, schemas

## Phase 1e: Tools

- \[ ] 32-38. New attachment tools, sync updates, policy exposure

## Phase 1f: Read path verification

- \[ ] 39-45. Verify all read paths include attached notes correctly

## Phase 1g: Documentation

- \[ ] 46-48. AGENT.md, README, CHANGELOG
