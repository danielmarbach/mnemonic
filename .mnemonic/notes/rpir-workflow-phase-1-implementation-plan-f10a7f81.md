---
title: RPIR workflow Phase 1 implementation plan
tags:
  - workflow
  - rpir
  - implementation
  - phase1
  - plan
lifecycle: permanent
createdAt: '2026-04-20T21:46:51.934Z'
updatedAt: '2026-04-25T21:43:24.549Z'
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: rpir-workflow-design-for-mnemonic-research-plan-implement-re-80b00851
    type: example-of
  - id: phase-2-rrf-ranking-completed-bb163f54
    type: supersedes
memoryVersion: 1
---
Phase 1 implementation plan for the RPIR workflow design. Also stored at `docs/superpowers/specs/2026-04-20-rpir-workflow-phase1-plan.md`.

## Implementation progress: COMPLETE ✓

- [x] Task 1: Add research and review to NoteRole enum
- [x] Task 2: Add role input parameter to remember and update
- [x] Task 3: Add role-based lifecycle defaults in remember()
- [x] Task 4: Add tests (9 integration + 1 unit, all passing)
- [x] Task 5: Fix README discrepancies
- [x] Task 6: Update mnemonic-workflow-hint prompt

All 646 tests pass, 0 failures. Typecheck clean.

## Changes made

### src/storage.ts

- Expanded `NoteRole` type union with `"research" | "review"` (line 9)
- Expanded `NOTE_ROLES` array with `"research"` and `"review"` (line 12)

### src/index.ts

- Added `NOTE_ROLES`, `NoteRole` imports from storage.js
- Added `ROLE_LIFECYCLE_DEFAULTS` constant: research/plan/review → temporary, decision/summary/reference → permanent
- Added `role: z.enum(NOTE_ROLES).optional()` to remember input schema with description
- Updated lifecycle description to mention role-based defaults
- Added `role` to remember handler destructured params
- Changed lifecycle assignment: `lifecycle ?? (role ? ROLE_LIFECYCLE_DEFAULTS[role] : undefined) ?? "permanent"`
- Persist `role` in Note only when explicitly provided: `...(role ? { role } : {})`
- Added `role: z.enum(NOTE_ROLES).optional()` to update input schema with description
- Added `role` to update handler destructured params
- Applied `role` in update only when explicitly provided (no implicit lifecycle change)
- Updated workflow-hint prompt text to reflect role-based lifecycle defaulting

### README.md

- Changed `log` to `context` in valid roles list
- Added `research` and `review` to valid roles
- Added `low` to valid importance values
- Updated lifecycle sentence to describe role-based defaults

### tests/role-lifecycle.integration.test.ts (new)

- 9 integration tests covering role persistence, lifecycle defaults, override behavior, update semantics

### tests/role-suggestions.unit.test.ts

- Added unit test: suggestRole never returns "research" or "review"

### tests/tool-descriptions.integration.test.ts

- Updated prompt assertion to match new role-based defaulting text

## Out of scope for Phase 1

- `mnemonic-rpir-workflow` MCP prompt (Phase 2)
- `skills/mnemonic-rpir-workflow/SKILL.md` (Phase 2)
- AGENT.md updates (Phase 2)
- README workflow-roles section (Phase 2)
- `recall(mode: "workflow")` (Phase 3)
- Directional relationship types (Phase 3)
- Any changes to `role-suggestions.ts` inference logic
