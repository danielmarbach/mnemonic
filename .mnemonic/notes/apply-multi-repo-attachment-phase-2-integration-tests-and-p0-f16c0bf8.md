---
title: 'Apply: Multi-repo attachment Phase 2 — integration tests and P0 corrections'
tags:
  - workflow
  - apply
  - attachments
  - phase2
lifecycle: temporary
createdAt: '2026-05-23T12:38:37.909Z'
updatedAt: '2026-05-23T12:38:37.909Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
# Apply: Multi-repo attachment Phase 2 — integration tests and P0 corrections

## Sub-phase 2a: Test suite

- [x] 1. AttachedStorage.unit.test.ts
- [ ] 2. attached-vault.integration.test.ts
- [ ] 3. recall-pipeline.integration.test.ts (attachment boost, dedup)
- [ ] 4. tool-descriptions.integration.test.ts
- [ ] 5. output-rendering.integration.test.ts
- [ ] 6. mutation-error.integration.test.ts
- [ ] 7. isProject-migration.test.ts
- [ ] 8. config.unit.test.ts
- [ ] 9. vault.unit.test.ts (attachment additions)
- [ ] 10. storageLabel unit tests
- [ ] 11. vaultMatchesStorageScope unit tests
- [ ] 12. tool-output-schemas.unit.test.ts

## Sub-phase 2b: P0 verification and implementation

- [x] 14. collectVisibleNotes composite dedup — already uses `${note.id}::${vault.storage.vaultPath}`
- [x] 16. storedIn: "attached" — already implemented in StorageScope, vaultMatchesStorageScope, and Zod schema
- [ ] 13. Recall attachment boost — needs ATTACHMENT_BOOST = PROJECT_SCOPE_BOOST / 2 for project-attached vaults
- [ ] 15. scope: "project" attachment-extended semantics in recall — attached notes should pass project scope filter
- [ ] 17. ProjectSummaryNotesSchema.attachedVault count field
- [ ] 18. Run full test suite

## Constraints

- No new I/O on cold paths
- Fail-soft to undefined
- Session cache reuse
- Performance principles compliance
