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
updatedAt: '2026-04-23T19:16:23.605Z'
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mnemonic-role-suggestions-are-read-only-runtime-hints-consol-532d5d9b
    type: explains
  - id: mcp-workflow-ux-hint-prompt-tool-descriptions-and-session-st-e89a18fc
    type: related-to
  - id: phase-2-design-workflow-hint-first-working-state-continuity-07153fcb
    type: related-to
  - id: rpir-workflow-phase-1-implementation-plan-f10a7f81
    type: example-of
memoryVersion: 1
---
Approved design for evolving mnemonic into a canonical workflow artifact store with first-class research/plan/review support.

## Phase status (as of 2026-04-23)

- **Phase 1 — complete:** roles (`research`, `review`), role parameter support, role-based lifecycle defaults, tests, and workflow-hint alignment shipped.
- **Phase 2 — complete:** `mnemonic-rpir-workflow` MCP prompt added, `skills/mnemonic-rpir-workflow/SKILL.md` added, prompt coverage tests added, `AGENT.md` and `README.md` updated with RPIR conventions.
- **Phase 3 — planned (combined):** `recall(mode: "workflow")` + directional relationship types in one always-on release.
- **Phase 4 — pending:** real-task validation cycle not run yet.
- **Phase 5 — pending:** orchestrator decision deferred until validation evidence exists.

## Core principle

mnemonic is the canonical store for workflow artifacts, not the workflow runtime.

## Important Phase 3 revelations

- **Always-on rollout (no flags):** Phase 3 ships directly without feature flags.
- **No migration:** relationship changes are additive only; no bulk rewriting of existing notes.
- **Indefinite compatibility fallback:** workflow reconstruction keeps `related-to` fallback indefinitely.
- **External-user posture:** compatibility is treated as a long-term public contract, not a short-lived internal bridge.
- **Precision path:** `derives-from` and `follows` improve chain quality but are optional; mixed graphs are first-class.

## Design choices locked in

- **New roles:** Add `research` and `review` — makes workflow artifacts first-class without tag overload
- **Apply/task role:** No new role — use existing roles + tags — avoids role explosion
- **Apply/task role split:** `role: plan` for intended executable work; `role: context` for execution observations/checkpoints — prevents drift without adding an apply role
- **Role inference:** Inference stays on 5 existing roles; skill drives explicit typing of research/review — avoids overlap/drift in inference signals
- **Role persistence:** Explicit roles are persisted (existing contract); research/review are set by skill, not inference — no contract change needed
- **Lifecycle defaults:** Role-based soft defaults in `remember()` at creation time only — common workflow artifacts get the right lifecycle most of the time; updates do not implicitly rewrite lifecycle
- **Request root note:** Convention only: `role: context`, `lifecycle: temporary`, tagged as workflow request root — avoids adding a request role while keeping workflow roots consistent
- **Plan currency:** Prefer one current plan note per request — simplifies retrieval, handoff, and review
- **Relationship types:** Existing 4 types + workflow conventions; Phase 3 adds `derives-from` and `follows` additively
- **Relationship density:** Use minimal relationship set; link to immediate upstream artifacts only — keeps the graph sparse and readable
- **Directional types:** Enabled in Phase 3 as precision edges, with indefinite fallback to `related-to`
- **Skill delivery:** Single RPIR skill in `skills/` directory, same repo — lowest friction, same release
- **MCP prompt:** Separate `mnemonic-rpir-workflow` prompt — memory protocol and task workflow are different concerns
- **Ergonomic helper:** `recall(mode: "workflow")` in Phase 3 with bounded chain-oriented retrieval
- **Orchestration:** Explicitly out of scope — mnemonic is artifact store, not runtime

## Core changes (Phase 1)

### Role enum expansion

Add `research` and `review` to `NoteRole` in `src/storage.ts`. Inference stays on the 5 existing roles; skill drives explicit typing of research/review.

### Role-based lifecycle defaults

Soft defaults in `remember()` at creation time only: research/plan/review → temporary, decision/summary/reference → permanent. Updates do not implicitly rewrite lifecycle.

### No migration needed

Role is already an optional field. The change is purely additive: existing notes with no role or existing valid roles are unaffected. `isNoteRole()` uses `NOTE_ROLES.includes()`, so the new values become valid where they were previously ignored. No schema version bump required.

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

Use minimal relationship set; link to immediate upstream artifacts only. No dense cross-linking. Specific edges:

- research `related-to` request
- plan `related-to` request + the key research notes
- apply/task `related-to` plan
- review `related-to` apply or plan
- outcome `related-to` plan and optionally request

Phase 3 adds optional directional equivalents where explicit sequencing/derivation is known:

- `derives-from`
- `follows`

Workflow recall must continue supporting mixed legacy and directional graphs.

## Plan currency

Prefer one current plan note per request. Update or supersede when plan evolves. Avoid concurrent "current" plans unless exploring alternatives (tag: `alternative/a`, `alternative/b`).

## Material plan change definition

A plan change is material if it changes: architecture/design direction, file/module scope, task ordering/dependencies, validation strategy, key assumptions/constraints. Non-material: wording cleanup, clearer phrasing, adding detail that does not change execution.

## Consolidation output distinction

At workflow end: decision note for resolved approaches, summary note for outcome recaps. Promote reusable facts/patterns into permanent reference notes. Let pure scaffolding and redundant checkpoints expire.

## Stage protocol

1. Research -- create/update request root note, create research notes, distill into a short research summary when needed
2. Plan -- create/update plan note linked to research/request, keep concise and executable
3. Implement -- create temporary apply/task notes, hand narrow context to subagent if non-trivial
4. Review -- create review notes, fix directly or mark blockers, update plan if review changes it materially
5. Iterate -- only when review/checks warrant it (optional, not default)

## Subagent handoff contract

A subagent receives: request note, current plan note or relevant slice, relevant research note(s), a few durable recalled notes, narrow file/task scope.
A subagent returns: updated temporary apply note, optional review note, recommendation: continue / block / update plan.

## Convention delivery (Phase 2)

- Separate MCP prompt `mnemonic-rpir-workflow` (memory protocol and task workflow are different concerns)
- Skill `skills/mnemonic-rpir-workflow/SKILL.md` with stage checklists, subagent handoff template, commit discipline rules, consolidation guidance, examples

## Commit discipline

Three classes: memory (research/plan/review artifacts), work (code/test/docs), memory (consolidation/promotion). Plan changes materially -- update notes, memory commit, then continue.

## Phase 3 helpers (planned combined)

1. `recall(mode: "workflow")` -- chain reconstruction via role + relationship traversal, bounded and chain-oriented
2. Directional types `derives-from`/`follows` -- additive precision layer with indefinite fallback to `related-to`

## Phase 4 validation

Run RPIR on 3-5 real tasks: research-heavy, plan-heavy refactor, multi-step implementation, review/fix cycle. Measure token cost, plan drift, temporary-note cleanup burden, retrieval quality, graph readability.

## Phase 5 orchestrator decision

Build a separate orchestration layer only if real usage consistently wants automated subagent dispatch, reviewer fanout, loop scheduling. mnemonic stays the artifact backbone; the orchestrator stays thin.

## Non-goals

- No orchestration runtime in core
- No full task engine in core
- No mandatory loop model
- No rich task-state schema in core
- No full autonomous loop-first workflow
- No many helper tools up front

## Alternatives considered

- **Minimal Core, Maximal Skill:** Only enum + defaults in core. Rejected because convention only reaches skill-aware agents; the MCP prompt is a natural delivery channel.
- **Core + Schema:** Add validation for workflow graph shape. Rejected because it contradicts the no-heavy-schema principle.
- **Mix RPIR into existing mnemonic-workflow-hint:** Rejected because memory protocol and task workflow are different concerns.
- **Full inference for research/review:** Rejected because research overlaps with context signals and review overlaps with plan signals.
- **Adding a request role:** Rejected because `role: context` + tag convention is sufficient and avoids role proliferation.

## Open questions

- One plan note vs. plan revisions in practice
- Whether `recall(mode: "workflow")` output shape is sufficient without extra helper tools
- Whether memory commits become too noisy
