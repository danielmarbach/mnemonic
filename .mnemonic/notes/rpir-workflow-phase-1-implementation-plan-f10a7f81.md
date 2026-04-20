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
updatedAt: '2026-04-20T21:53:00.821Z'
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: rpir-workflow-design-for-mnemonic-research-plan-implement-re-80b00851
    type: example-of
memoryVersion: 1
---
Phase 1 implementation plan for the RPIR workflow design. Also stored at `docs/superpowers/specs/2026-04-20-rpir-workflow-phase1-plan.md`.

## Key discovery

`remember` currently has NO `role` input parameter -- roles are only set via frontmatter or inferred at runtime. The plan adds `role` as an explicit input parameter to both `remember` and `update`, which is essential for the RPIR skill to drive explicit typing.

## No migration needed

Role is already an optional field in the Note interface. The change is purely additive: existing notes with no role or existing valid roles are unaffected. `isNoteRole()` uses `NOTE_ROLES.includes()`, so the new values become valid where they were previously ignored. No schema version bump required.

## 6 tasks

### Task 1: Add research and review to NoteRole enum

- `src/storage.ts` line 9: expand type union with `"research" | "review"`
- `src/storage.ts` line 12: expand NOTE_ROLES array with `"research"` and `"review"`
- No changes to role-suggestions.ts (inference stays 5-role only)
- isNoteRole() (line 400-402) works automatically (uses NOTE_ROLES.includes)

### Task 2: Add role input parameter to remember and update

- Add `role: z.enum(NOTE_ROLES).optional()` to remember input schema (after lifecycle param, around line 1849)
- Describe as: "Optional prioritization hint for the note. Inferred automatically when omitted. Set explicitly for workflow artifacts like research or review notes."
- Add `role` to remember handler destructured params (line 1890)
- Persist `role` in Note object only when explicitly provided: `role: role ?? undefined` (around line 1922-1931)
- Add same `role` param to update input schema (around line 2727)
- Describe as: "Change role. Preserve the existing value unless you're intentionally switching it."
- Add `role` to update handler destructured params (line 2751)
- Apply `role` change in update logic only when explicitly provided

### Task 3: Add role-based lifecycle defaults in remember()

- Define `ROLE_LIFECYCLE_DEFAULTS` constant near remember handler in `src/index.ts`:
  - research: temporary, plan: temporary, review: temporary
  - decision: permanent, summary: permanent, reference: permanent
  - context: no default (falls through to "permanent")
- Change line 1924 from `lifecycle: lifecycle ?? "permanent"` to `lifecycle: lifecycle ?? (role ? ROLE_LIFECYCLE_DEFAULTS[role] : undefined) ?? "permanent"`
- Precedence: explicit lifecycle > role-based default > "permanent" fallback
- update() does NOT get role-based defaults (creation-time only per design)
- Update lifecycle parameter description to note the role-based defaulting

### Task 4: Add tests

- Integration test: `remember` with `role: "research"` creates note with `role: research` in frontmatter
- Integration test: `remember` with `role: "review"` creates note with `role: review` in frontmatter
- Integration test: `remember` with `role: "research"` and no explicit `lifecycle` defaults to `temporary`
- Integration test: `remember` with `role: "plan"` and no explicit `lifecycle` defaults to `temporary`
- Integration test: `remember` with `role: "decision"` and no explicit `lifecycle` defaults to `permanent`
- Integration test: `remember` with `role: "research"` and explicit `lifecycle: "permanent"` overrides the default
- Integration test: `update` with `role: "review"` changes role on existing note
- Integration test: `update` with role change does NOT implicitly change lifecycle
- Integration test: `remember` without `role` does NOT write `role` to frontmatter (inference is runtime-only)
- Unit test: `suggestRole` never returns `"research"` or `"review"` (inference is 5-role only)

### Task 5: Fix README discrepancies

- Line 344: Change `log` to `context` in the valid roles list
- Line 344: Add `low` to the valid importance values (`high`, `normal`, `low`)

### Task 6: Update mnemonic-workflow-hint prompt

- Update the prompt text at line 6003 to reflect role-based lifecycle defaulting behavior
- Change "role: plan does not imply temporary" to reflect that plan now defaults to temporary when lifecycle is omitted
- Preserve all other prompt content (working-state continuity, anti-patterns, etc.)

## Out of scope for Phase 1

- `mnemonic-rpir-workflow` MCP prompt (Phase 2)
- `skills/mnemonic-rpir-workflow/SKILL.md` (Phase 2)
- AGENT.md updates (Phase 2)
- README workflow-roles section (Phase 2)
- `recall(mode: "workflow")` (Phase 3)
- Directional relationship types (Phase 3)
- Any changes to `role-suggestions.ts` inference logic
