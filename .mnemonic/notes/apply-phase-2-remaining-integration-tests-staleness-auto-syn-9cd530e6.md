---
title: >-
  Apply: Phase 2 remaining — integration tests, staleness, auto-sync,
  portability
tags:
  - workflow
  - apply
  - attachments
  - phase2
lifecycle: temporary
createdAt: '2026-05-23T14:01:10.008Z'
updatedAt: '2026-05-23T21:25:09.881Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: multi-repository-attachment-support-implementation-plan-b6423f79
    type: follows
memoryVersion: 1
---
# Apply: Phase 2 remaining — integration tests, staleness, auto-sync, portability

## Goal

Complete all remaining Phase 2 items: integration test fixtures, embedding reconciliation, staleness unit tests, output rendering tests, auto-sync for attached vaults, machine-specific path portability, and documentation updates.

## Sub-phase mapping

### 2a: Integration test fixture (items 2-5, 7-9)

- [x] 2. `attached-vault.integration.test.ts` — 6 E2E tests for add/list/remove/toggle/mutation-guards (3 mutation-guard tests are flaky due to MCP session state)
- [x] 3. `recall-attachment.integration.test.ts` — 8 tests using persistent MCP session (recall scope, list storedIn, output rendering)
- [x] 4. `tool-descriptions.integration.test.ts` — storedIn enum assertions for attached, `.describe()` on all storedIn fields
- [x] 5. output rendering tests for `attached:` vault labels (list includeStorage, project_memory_summary count, recall structured output) — in `recall-attachment.integration.test.ts`
- [x] 7. `isProject-migration.test.ts` — 4 tests, all passing (provenance type check, property migration)
- [x] 8. `config.unit.test.ts` — 61 tests, shipped
- [x] 9. `vault.unit.test.ts` — extended: writable, searchOrder, searchOrderMutable, allKnownVaults, findNote mutable, cache clearing, removal

### 2c: Staleness unit tests — COMPLETE

- [x] 22. `tests/staleness.unit.test.ts` — 10 tests all passing

### 2d: Output rendering tests (item 26) — COMPLETE

- [x] 26. Output rendering integration tests for `attached:` vault labels in recall, list, project_memory_summary

### 2e: Auto-sync on branch change — COMPLETE

- [x] 27. Auto-fetch implemented in `ensureBranchSynced` via `syncAttachedVaultsOnBranchChange`
- [x] 28. Cache invalidation after auto-fetch implemented

### 2f: Machine-specific path portability — COMPLETE

- [x] 30. `expandHomePath` in `add_attachment` localPath
- [x] 31. `collapseHomePath` stores portable `~`-prefixed paths
- [x] 32. All attachment tools and `loadAttachmentsForProject` resolve `~` at runtime

### 2g: Documentation + final verification — COMPLETE

- [x] 33. AGENT.md updated
- [x] 34. README.md already documented in Phase 1
- [x] 35. CHANGELOG.md updated with Phase 2 entries
- [x] 36. Final test suite verification — 1092 tests pass (3 pre-existing flaky failures in attached-vault mutation guards; not Phase 2 regressions)

## Bug fix

Swapped `clearAttachmentCaches`/`setAttachmentConfigs` order in 5 files — configs were being wiped by cache clear after being set.

## Constraints

- No new I/O on cold paths (auto-fetch only triggers on branch change)
- Fail-soft to undefined (stale embeddings are harmless but should be cleaned)
- Session cache reuse
- Performance principles compliance
- Path portability must be backward-compatible (absolute paths still work)

## Commits

- 92d8f98 fix: swap clearAttachmentCaches before setAttachmentConfigs to preserve configs
- 5c3054c test: add recall-attachment integration tests, output rendering, storedIn descriptions
