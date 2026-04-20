---
title: RPIR workflow Phase 1 implementation plan
tags:
  - workflow
  - rpir
  - implementation
  - phase1
  - plan
lifecycle: temporary
createdAt: '2026-04-20T21:46:51.934Z'
updatedAt: '2026-04-20T21:47:16.005Z'
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: rpir-workflow-design-for-mnemonic-research-plan-implement-re-80b00851
    type: example-of
memoryVersion: 1
---
Phase 1 implementation plan for the RPIR workflow design. Full plan at `docs/superpowers/specs/2026-04-20-rpir-workflow-phase1-plan.md`. Full spec at `docs/superpowers/specs/2026-04-20-rpir-workflow-design.md`.

## Key discovery

`remember` currently has NO `role` input parameter — roles are only set via frontmatter or inferred at runtime. The plan adds `role` as an explicit input parameter to both `remember` and `update`, which is essential for the RPIR skill to drive explicit typing.

## 6 tasks

### Task 1: Add research and review to NoteRole enum

- `src/storage.ts` line 9: expand type union
- `src/storage.ts` line 12: expand NOTE_ROLES array
- No changes to role-suggestions.ts (inference stays 5-role only)
- isNoteRole() works automatically (uses NOTE_ROLES.includes)

### Task 2: Add role input parameter to remember and update

- Add `z.enum(NOTE_ROLES).optional()` to remember input schema
- Add role to handler destructured params
- Persist role in Note object only when explicitly provided
- Same for update: add role param, apply when provided

### Task 3: Add role-based lifecycle defaults in remember()

- ROLE_LIFECYCLE_DEFAULTS: research/plan/review → temporary, decision/summary/reference → permanent
- Precedence: explicit lifecycle > role-based default > "permanent" fallback
- update() does NOT get role-based defaults (creation-time only per design)

### Task 4: Add tests

- 10 integration tests: role persistence, lifecycle defaults, override behavior, update role change without implicit lifecycle change
- 1 unit test: suggestRole never returns research/review

### Task 5: Fix README discrepancies

- Line 344: log → context
- Line 344: add low to importance values

### Task 6: Update mnemonic-workflow-hint prompt

- Reflect new role-based lifecycle defaulting behavior
- Correct the "role: plan does not imply temporary" statement
