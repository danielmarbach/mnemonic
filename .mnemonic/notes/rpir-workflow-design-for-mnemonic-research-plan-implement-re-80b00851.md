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
updatedAt: '2026-04-24T11:59:43.410Z'
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
  - id: rpir-workflow-phase-3-implementation-plan-22ac514b
    type: example-of
memoryVersion: 1
---
Approved design for evolving mnemonic into a canonical workflow artifact store with first-class research/plan/review support.

## Phase status (as of 2026-04-24)

- **Phase 1 — complete:** roles (`research`, `review`), role parameter support, role-based lifecycle defaults, tests, and workflow-hint alignment shipped.
- **Phase 2 — complete:** workflow prompt + skill delivery conventions shipped with docs and prompt coverage tests.
- **Phase 3 — complete (branch):** `recall(mode: "workflow")` plus directional relationship types shipped with additive compatibility behavior.
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

- Add `research` and `review` roles for workflow artifacts.
- Keep apply/task notes on existing roles (`plan` for intended steps, `context` for execution observations) with `apply` tag.
- Keep role inference conservative (existing roles only); skill/prompt drives explicit workflow role usage.
- Use role-based lifecycle soft defaults at creation time only.
- Keep one request-root convention (`role: context`, temporary, workflow/request tags).
- Keep one current plan note per request as the default operating model.
- Keep relationship graph sparse, immediate-upstream focused.
- Use directional types as additive precision, never as mandatory requirement.
- Keep prompts and skills complementary.
- Keep orchestration runtime out of mnemonic core.

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

Minimal set, immediate upstream links only:

- research `related-to` request
- plan `related-to` request + key research notes
- apply/task `related-to` plan
- review `related-to` apply or plan
- outcome `related-to` plan (optionally request)

Directional additions for explicit derivation/ordering:

- `derives-from`
- `follows`

Workflow recall supports mixed legacy and directional graphs.

## Stage protocol

1. Research — create/update request root note, create research notes, distill when needed.
2. Plan — create/update plan note linked to request/research, keep concise and executable.
3. Implement — create temporary apply/task notes, hand narrow context to subagent if non-trivial.
4. Review — create review notes, fix or mark blockers, update plan first if review changes execution materially.
5. Iterate — only when checks/review warrant it.

## Convention delivery decisions

- Workflow prompt name: `mnemonic-rpi-workflow`.
- Workflow skill location/name: `skills/mnemonic-rpi-workflow/SKILL.md`.
- Memory protocol prompt remains separate: `mnemonic-workflow-hint`.

## Skill packaging decision essentials

- Skills are part of the product experience and ship with mnemonic releases.
- Packaging includes a repeatable install/update flow for local client skill directories.
- Target distribution includes Claude, OpenCode, and custom client paths.

## Commit discipline

Three classes: memory (research/plan/review artifacts), work (code/test/docs), memory (consolidation/promotion).

## Phase 4 validation

Run RPIR on 3-5 real tasks: research-heavy, plan-heavy refactor, multi-step implementation, review/fix cycle. Measure token cost, plan drift, temporary-note cleanup burden, retrieval quality, and graph readability.

## Phase 5 orchestrator decision

Build a separate orchestration layer only if real usage consistently wants automated subagent dispatch/review looping. mnemonic remains artifact backbone; orchestrator remains thin.

## Non-goals

- No orchestration runtime in core
- No full task engine in core
- No mandatory loop model
- No rich task-state schema in core

## Open questions

- One plan note vs. plan revisions in long-running work
- Whether memory commits become too noisy
