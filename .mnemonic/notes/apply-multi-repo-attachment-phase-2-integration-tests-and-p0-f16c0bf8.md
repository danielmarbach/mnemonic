---
title: 'Apply: Multi-repo attachment Phase 2 — integration tests and P0 corrections'
tags:
  - workflow
  - apply
  - attachments
  - phase2
lifecycle: temporary
createdAt: '2026-05-23T12:38:37.909Z'
updatedAt: '2026-05-23T12:57:16.646Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
# Apply: Multi-repo attachment Phase 2 — integration tests and P0 corrections

## Sub-phase 2b: P0 verification and implementation ✅

- [x] 13. Recall attachment boost — ATTACHMENT_BOOST = 0.015
- [x] 14. collectVisibleNotes composite dedup — already implemented
- [x] 15. scope: "project" attachment-extended semantics
- [x] 16. storedIn: "attached" — already implemented
- [x] 17. ProjectSummaryNotesSchema.attachedVault count field
- [x] 18. Full test suite passes (985 tests)
- [x] Review fix: collectVisibleNotes excludes attached vaults from scope:global
- [x] Review fix: Updated scope descriptions in list.ts and discover-tags.ts

## Sub-phase 2a: Test suite (in progress)

- [x] 1. AttachedStorage.unit.test.ts (45 tests)
- [x] 10. storageLabel unit tests (in vault-helpers.unit.test.ts, 14 tests)
- [x] 11. vaultMatchesStorageScope unit tests (in vault-helpers.unit.test.ts)
- [x] 12. ProjectSummaryNotesSchema has attachedVault field (tested)
- [ ] 2. attached-vault.integration.test.ts
- [ ] 3. recall-pipeline.integration.test.ts
- [ ] 4. tool-descriptions.integration.test.ts
- [ ] 5. output-rendering.integration.test.ts
- [ ] 6. mutation-error.integration.test.ts
- [ ] 7. isProject-migration.test.ts
- [ ] 8. config.unit.test.ts
- [ ] 9. vault.unit.test.ts (attachment additions)
