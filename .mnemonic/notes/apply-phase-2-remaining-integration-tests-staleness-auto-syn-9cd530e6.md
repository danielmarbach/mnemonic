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
updatedAt: '2026-05-23T14:01:10.008Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
# Apply: Phase 2 remaining — integration tests, staleness, auto-sync, portability

## Goal

Complete all remaining Phase 2 items: integration test fixtures, embedding reconciliation, staleness unit tests, output rendering tests, auto-sync for attached vaults, machine-specific path portability, and documentation updates.

## Sub-phase mapping

### 2a: Integration test fixture (items 2-5, 7-9)

- [ ] 2. `attached-vault.integration.test.ts` — comprehensive E2E test fixture covering all attachment tool behaviors
- [ ] 3. `recall-pipeline.integration.test.ts` — attached vault notes score/rank correctly with attachment boost, dedup by composite key
- [ ] 4. `tool-descriptions.integration.test.ts` — tool descriptions match schema, `storedIn: "attached"` and vault labels
- [ ] 5. `output-rendering.integration.test.ts` — text output for `attached:` vault labels
- [ ] 7. `isProject-migration.test.ts` — verify all former `isProject` call sites use `provenance` or `writable`
- [ ] 8. `config.unit.test.ts` — already shipped (61 tests), verify coverage is sufficient
- [ ] 9. `vault.unit.test.ts` — VaultProvenance, writable, attachment vault creation, search order, findNote mutable

### 2c: Embedding reconciliation + unit tests (items 20, 22)

- [ ] 20. Embedding reconciliation on staleness: when branch tip changes, remove stale embeddings for notes that no longer exist in the new branch state
- [ ] 22. Unit tests for staleness detection and embedding reconciliation

### 2d: Output rendering tests (item 26)

- [ ] 26. Output rendering integration tests for `attached:` vault labels in recall, list, get, where_is_memory, recent_memories, project_memory_summary, memory_graph

### 2e: Auto-sync for attached vaults (items 27-28)

- [ ] 27. Implement auto-fetch for attached vault branches in `ensureBranchSynced` — when the consuming project's branch changes, also fetch attached vault branches and refresh their caches
- [ ] 28. Invalidate attached vault caches after auto-fetch, update branch tip hashes

Design: Users who attach repos accept the I/O implications. Auto-fetch only when the consuming project's branch actually changed (same gate as existing `ensureBranchSynced`). Fetch attached vaults in parallel if possible.

### 2f: Machine-specific path portability (items 30-32)

- [ ] 30. Support `~` expansion in `add_attachment` `localPath` using existing `expandHomePath()` from paths.ts
- [ ] 31. Store `localPath` in a portable format: if within `~` use `~`-prefixed path; if within current git root use relative path; otherwise absolute
- [ ] 32. Resolve portable paths at runtime in `loadAttachmentsForProject`: expand `~`, resolve relative paths against project git root. Document behavior in AGENT.md.

Design: `expandHomePath()` already exists. Strategy: store paths as relative to the consuming project's git root when possible, or `~`-prefixed for home-directory paths. Resolve at load time.

### 2g: Documentation + final verification (items 33-36)

- [ ] 33. Update AGENT.md with auto-sync behavior, path portability, fail-soft embeddings
- [ ] 34. Update README.md with Phase 2 additions
- [ ] 35. Update CHANGELOG.md with Phase 2 entry
- [ ] 36. Run full test suite final time to confirm no regressions

## Constraints

- No new I/O on cold paths (auto-fetch only triggers on branch change)
- Fail-soft to undefined (stale embeddings are harmless but should be cleaned)
- Session cache reuse
- Performance principles compliance
- Path portability must be backward-compatible (absolute paths still work)
