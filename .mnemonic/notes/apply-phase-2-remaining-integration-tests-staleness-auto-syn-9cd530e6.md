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
updatedAt: '2026-05-23T19:03:10.559Z'
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

- [ ] 2. `attached-vault.integration.test.ts` — comprehensive E2E test fixture covering all attachment tool behaviors
- [ ] 3. `recall-pipeline.integration.test.ts` — attached vault notes score/rank correctly with attachment boost, dedup by composite key
- [ ] 4. `tool-descriptions.integration.test.ts` — tool descriptions match schema, `storedIn: "attached"` and vault labels
- [ ] 5. `output-rendering.integration.test.ts` — text output for `attached:` vault labels
- [ ] 7. `isProject-migration.test.ts` — verify all former `isProject` call sites use `provenance` or `writable`
- [ ] 8. `config.unit.test.ts` — already shipped (61 tests), verify coverage is sufficient
- [ ] 9. `vault.unit.test.ts` — VaultProvenance, writable, attachment vault creation, search order, findNote mutable

### 2c: Staleness unit tests — COMPLETE

- [x] 22. Unit tests for staleness detection and embedding reconciliation
  - `tests/staleness.unit.test.ts` — 10 tests, all passing
  - VaultManager staleness: outdated hash updates to current tip, matching hash preserved, working-tree mode skips check, evolving hash detected after commit+clearCache
  - removeStaleEmbeddings: removes orphaned embeddings, preserves active embeddings, handles multiple stale, no-error on missing files
  - clearAttachmentCaches+reload: fresh Vaults after clear, both vault and config caches cleared

### 2d: Output rendering tests (item 26)

- [ ] 26. Output rendering integration tests for `attached:` vault labels in recall, list, get, where_is_memory, recent_memories, project_memory_summary, memory_graph

### 2f: Machine-specific path portability (items 30-32) — COMPLETE

- [x] 30-32. Path portability shipped

### 2g: Documentation + final verification (items 33-36)

- [x] 33-35. Documentation shipped
- [ ] 36. Run full test suite final time to confirm no regressions

## Constraints

- No new I/O on cold paths (auto-fetch only triggers on branch change)
- Fail-soft to undefined (stale embeddings are harmless but should be cleaned)
- Session cache reuse
- Performance principles compliance
- Path portability must be backward-compatible (absolute paths still work)
