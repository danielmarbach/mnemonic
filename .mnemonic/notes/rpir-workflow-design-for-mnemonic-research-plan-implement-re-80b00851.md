---
title: 'RPIR workflow design for mnemonic: research→plan→implement→review'
tags:
  - workflow
  - rpir
  - design
  - roles
  - decision
lifecycle: permanent
createdAt: '2026-04-20T21:36:57.480Z'
updatedAt: '2026-04-20T21:37:09.165Z'
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mnemonic-role-suggestions-are-read-only-runtime-hints-consol-532d5d9b
    type: explains
  - id: mcp-workflow-ux-hint-prompt-tool-descriptions-and-session-st-e89a18fc
    type: related-to
memoryVersion: 1
---
Approved design for evolving mnemonic into a canonical workflow artifact store with first-class research/plan/review support. Full spec at `docs/superpowers/specs/2026-04-20-rpir-workflow-design.md`.

## Core principle

mnemonic is the canonical store for workflow artifacts, not the workflow runtime.

## Core changes (Phase 1)

### Role enum expansion

Add `research` and `review` to `NoteRole`. Inference stays on the 5 existing roles; skill drives explicit typing of research/review.

### Role-based lifecycle defaults

Soft defaults in `remember()` at creation time only: research/plan/review → temporary, decision/summary/reference → permanent. Updates do not implicitly rewrite lifecycle.

### Request root note convention

`role: context`, `lifecycle: temporary`, `tags: ["workflow", "request"]`. One per RPIR workflow. All artifacts relate to it.

## Apply/task note split

No new role. Use `role: plan` for intended executable work, `role: context` for execution observations/checkpoints. Both tagged with `apply` tag.

## Canonical note graph

```text
request root (role: context, temporary)
  → research (temporary)
  → plan (temporary)
  → apply/task notes (temporary; role: plan for steps, role: context for observations)
  → review (temporary)
  → outcome/decision/summary (permanent)
```

## Relationship conventions

Use minimal relationship set; link to immediate upstream artifacts only. No dense cross-linking.

## Plan currency

Prefer one current plan note per request. Update or supersede when plan evolves. Avoid concurrent "current" plans unless exploring alternatives (tag: `alternative/a`, `alternative/b`).

## Material plan change definition

A plan change is material if it changes: architecture/design direction, file/module scope, task ordering/dependencies, validation strategy, key assumptions/constraints. Non-material: wording cleanup, clearer phrasing, adding detail that does not change execution.

## Consolidation output distinction

At workflow end: decision note for resolved approaches, summary note for outcome recaps. Promote reusable facts/patterns into permanent reference notes. Let pure scaffolding and redundant checkpoints expire.

## Convention delivery (Phase 2)

- Separate MCP prompt `mnemonic-rpir-workflow` (memory protocol and task workflow are different concerns)
- Skill `skills/mnemonic-rpir-workflow/SKILL.md` with stage checklists, subagent handoff template, commit discipline rules, consolidation guidance, examples

## Commit discipline

Three classes: memory (research/plan/review artifacts), work (code/test/docs), memory (consolidation/promotion). Plan changes materially → update notes → memory commit → then continue.

## Phase 3 helpers (gated)

1. `recall(mode: "workflow")` — chain reconstruction via role + relationship traversal
2. Directional types `derives-from`/`follows` — only if chain reconstruction is unreliable with `related-to`

## Open questions

- One plan note vs. plan revisions in practice
- Whether `related-to` is sufficient for chain recovery
- Whether `recall(mode: "workflow")` is enough without a dedicated helper
- Whether memory commits become too noisy
