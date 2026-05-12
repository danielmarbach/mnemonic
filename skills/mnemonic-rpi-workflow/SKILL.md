---
name: mnemonic-rpi-workflow
description: Executes multi-step research-plan-implement-review workflows using mnemonic for workflow artifacts. Triggers on multi-step feature or bugfix work, subagent handoffs, plan-heavy tasks, or any work needing structured RPIR artifacts with explicit handoffs and consistent role/relationship conventions. Review phase always dispatches a fresh-context subagent with adversarial posture and constraint violation hunting.
---

# RPIR Workflow: Research → Plan → Implement → Review

## Core Principle

mnemonic stores workflow artifacts; it does not run the workflow.

Note creation is the attention filter: capture decisions, outcomes, corrections, durable constraints, and validated learnings; skip routine low-signal chatter.

## Relationship Conventions

Use `derives-from` for lineage and `follows` for sequence by default. Fall back to `related-to` only when direction is unclear. Keep relationships sparse — link only to immediate upstream artifacts.

## Stage Checklists

### 1. Research

- Create or update one request root: `role: context`, `lifecycle: temporary`, `tags: ["workflow", "request"]`.
- Call `recall` before creating notes to avoid duplicates.
- Create research notes: `role: research`, `lifecycle: temporary`.
- Distill when findings are scattered.
- Link research to request root (`derives-from` preferred).

### 1a. Research → Plan Handoff

Before creating a plan note:
1. Present research findings to the user
2. Confirm direction, priorities, and constraints
3. Do not assume the plan direction based on research alone — the user may have refinements that reshape the plan materially

Only after confirmation: proceed to Plan checklist.

### 2. Plan

- Create or update one current plan note: `role: plan`, `lifecycle: temporary`.
- Link to request root and key research notes (`derives-from` for lineage, `follows` for sequence).
- Keep the plan concise and executable.
- For non-trivial work, include a short markdown checkbox list (`- [ ]`) for executable steps.
- One current plan per request; update or supersede as needed.
- Update plan note before continuing if scope, architecture, dependencies, or assumptions change materially.
- After drafting, run a self-check: does each research requirement map to a plan item? Are there placeholders (TBD, TODO)? Are step references internally consistent?

### 2a. Plan → Implement Handoff

Before dispatching subagents or starting implementation:
1. Confirm the plan is endorsed
2. Confirm scope and priorities haven't shifted since planning

Only after confirmation: proceed to Implement checklist.

### 3. Implement

- Create apply/task notes: `lifecycle: temporary`, tagged `apply`.
- `role: plan` for executable steps; `role: context` for observations and checkpoints.
- Keep checkbox state current as work advances (`[ ]` → `[x]`), and add new items when scope expands.
- Link to plan note (`follows` for ordered steps).
- For non-trivial work, dispatch a subagent with narrow scope (see [handoff template](#subagent-handoff-template)).

### 4. Review (Fresh-Context Subagent Required)

The implementer's own context is contaminated — they designed the code, so they see intent rather than behavior. Review must be performed by a fresh-context subagent that has no prior exposure to the implementation decisions.

**Before writing the review, the orchestrator must:**
1. `get` the research note(s), plan note, and apply/task note(s) linked to this work
2. Read the apply/task note(s) to confirm what actually shipped
3. Extract all explicit constraints from the plan (performance constraints, I/O constraints, fail-soft requirements, schema requirements, etc.) into a constraint checklist

**The review subagent receives the full artifact chain and must:**

**A. Constraint violation hunting (adversarial — prove violations don't exist)**
- Enumerate every explicit constraint from the plan (e.g., "no new I/O on cold paths", "fail-soft to undefined", "always populate contextual metrics", "every Zod field gets `.describe()`")
- For each constraint: cite the exact code path(s) that satisfy it, or flag it as a violation
- If any constraint is unmentioned in the apply note, flag it — silent omission is a violation

**B. Deliverable completeness**
- Does the implementation satisfy every requirement from research?
- Were all planned deliverables completed? If not, why, and is the deferral explicit?
- Are there gaps between what was planned and what was delivered?
- Were any assumptions from research invalidated during implementation?

**C. Fresh verification**
- Every verification command must be run fresh during this review — do not reuse results from implementation
- Record each command, result, and evidence

The review subagent must adopt an adversarial posture: assume violations exist and prove they don't. A review that only confirms what the apply note claims is not sufficient.

Create review notes: `role: review`, `lifecycle: temporary`.
Link to apply/task notes or plan (`derives-from` when conclusions derive from specific artifacts).

Record outcome: continue, block, or update plan.
Reconcile checklist state with verification evidence; call out any unchecked items explicitly.
If review causes a material plan change, update plan note first.

Every review note must include verification evidence:

```text
- Command: <run command>
- Result: pass | fail | partial
- Details: <counts, errors>
```

And a constraint checklist:

```text
| Constraint | Status | Evidence |
|---|---|---|
| <constraint from plan> | pass/fail | <code path or violation detail> |
```

### 5. Consolidate

- Create permanent decision note(s) and summary note(s).
- Promote reusable patterns into permanent reference notes.
- Deduplicate overlap while preserving unique evidence; do not aggressively summarize away factual detail.
- Explicitly remove temporary scaffolding through consolidation choices when safe. mnemonic does not auto-expire notes.

Use the templates in [closeout-templates.md](closeout-templates.md).

## Subagent Handoff Template

```text
Request note:      <note-id/title>
Plan note:         <note-id/title>
Research notes:    <note-id/title>, ...
Durable context:   <note-id/title>, ...

Task scope:
- Files/modules: <paths>
- Goal: <what to change>
- Validation: <tests/checks>

Must return: apply note content, optional review note, recommendation (continue | block | update plan)
```

### Review Handoff Variant

Dispatch a fresh-context subagent with the full artifact chain. The reviewer has no prior exposure to implementation decisions and must adopt an adversarial posture.

```text
Request note:      <note-id/title>
Research notes:    <note-id/title>, ...
Plan note:         <note-id/title>
Apply/task notes:  <note-id/title>, ...
Durable context:   <note-id/title>, ...

Constraint checklist (extracted from plan):
| Constraint | Status | Evidence |
|---|---|---|
| <explicit constraint from plan> | ? | <to be verified> |

Review scope:
- What was planned: <summary from plan note>
- What was implemented: <summary from apply note>
- Validation: <tests/checks>

Adversarial review mandate:
1. Assume violations exist — prove they don't
2. For each explicit plan constraint: cite the code path that satisfies it, or flag it as a violation
3. For each research requirement: confirm it is addressed or explicitly deferred
4. For each plan deliverable: verify matching evidence exists
5. Run all verification commands fresh — do not reuse implementation results
6. If a constraint is not mentioned in the apply note, flag it as a potential violation

Return: review note content with constraint checklist, recommendation (continue | block | update plan), and any unchecked items.
```

## Canonical Graph

```text
request root (context, temporary)
  → research (temporary)
  → plan (temporary)
  → apply/task (temporary; plan for steps, context for observations)
  → review (temporary)
  → outcome/decision/summary (permanent)
```

## Commit Discipline

Three commit classes:

1. **Memory** — research/plan/review artifacts
2. **Work** — code/test/docs implementation
3. **Memory** — consolidation of durable knowledge

Never mix classes. Before every commit, run this sequence:

1. `git status --short`
2. Stage only intended paths (never `git add .` or `git add -A`)
3. If unsure whether dirty files belong together, ask before committing
4. `git status --short` after commit to confirm

Material plan changes during implementation: commit the memory update first.

## Examples

**Research-heavy bug:** request root + research notes → plan with validation → apply + review → permanent decision + summary.

**Multi-file refactor:** request root + concise plan → subagent handoff → apply note + recommendation → review, consolidate.

**Small task:** request root + plan → one apply note → review says continue → one permanent summary.
