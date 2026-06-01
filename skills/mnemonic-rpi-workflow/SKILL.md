---
name: mnemonic-rpi-workflow
description: mnemonic RPIR (research-plan-implement-review) workflow. Use for multi-step feature/bugfix work, subagent handoffs, plan-heavy tasks, RPIR artifacts. Review phase: fresh-context subagent with adversarial posture for constraint violation hunting.
---

# RPIR Workflow: Research → Plan → Implement → Review

## Core Principle

mnemonic stores workflow artifacts; it does not run the workflow.

Note creation is the attention filter: capture decisions, outcomes, corrections, durable constraints, and validated learnings; skip routine low-signal chatter.

Treat all workflow output as advisory. Never blindly apply a plan, review finding, or suggestion without verifying it against real code paths and adjacent files.

Stop when the workflow is complete. Do not gold-plate: once review exits clean and consolidation is done, do not run extra cycles just to get a nicer closeout.

## Relationship Conventions

Use `derives-from` for lineage and `follows` for sequence by default. Fall back to `related-to` only when direction is unclear. Keep relationships sparse — link only to immediate upstream artifacts.

## Common Failure Modes

Avoid these shortcuts; they are workflow violations, not harmless simplifications:

- Do not skip Research for multi-step, plan-heavy, delegated, or review-sensitive work. Do research first: create/update the request root, call `recall`, and capture only durable findings.
- Do not create a plan immediately after research without a user handoff. Present the research findings and confirm direction, priorities, and constraints first.
- Do not implement from a stale plan. If scope, architecture, dependencies, assumptions, or constraints change materially, update the plan note before continuing.
- Do not use vague plans with placeholders such as TBD/TODO or generic steps like "fix code". Each research requirement must map to an executable plan item.
- Do not hand a subagent broad instructions such as "fix everything". Handoffs must be narrow and include files/modules, goal, validation, and required return format.
- Do not let the implementer review their own non-trivial work. Review requires a fresh-context subagent with an adversarial constraint-violation posture.
- Do not accept review claims without evidence. Each explicit plan constraint needs a cited satisfying code path or a flagged violation; silent omissions are violations.
- Do not reuse implementation verification during review. Review verification commands must be run fresh and recorded with command, result, and details.
- Do not mix memory commits and work commits. Commit workflow artifacts and implementation changes separately.
- Do not stage with `git add .` or `git add -A`. Run `git status --short`, then stage only intended paths; ask if dirty files may not belong together.

## Stage Checklists

### 1. Research

- Create or update one request root: `role: context`, `lifecycle: temporary`, `tags: ["workflow", "request"]`.
- Call `recall` before creating notes to avoid duplicates — state "avoid duplicates" explicitly.
- Create research notes: `role: research`, `lifecycle: temporary`.
- **Distill findings** when they are scattered across multiple sources or conversations. Write a single consolidated summary per topic, linking back to sources. Do not keep raw, unreduced copies as research notes.
- Link research to request root (`derives-from` preferred).
- **Preserve unique evidence:** when distilling, retain factual detail and unique evidence from each source — do not aggressively summarize away data points that future steps may need.

> **When to distill:** after the third related finding, after a conversation shift changes the topic, or when the research spans more than one hour of elapsed time.

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
- After drafting, run a **self-check** (use the exact word): does each research requirement map to a plan item? Are there placeholders (TBD, TODO)? Are step references internally consistent?

> **An executable plan means:** concrete steps with a clear owner/agent, no speculative guesses, no placeholders, each step ends with a verifiable outcome — "add a test that asserts X" not "improve test coverage".

### 2a. Plan → Implement Handoff

Before dispatching subagents or starting implementation:
1. Confirm the plan is endorsed
2. Confirm scope and priorities have not shifted since planning
3. If scope, architecture, dependencies, assumptions, or constraints have changed materially since the plan was drafted, update the plan note first — do not proceed with a stale plan

Only after confirmation: proceed to Implement checklist.

### 3. Implement

- **Material change during implementation:** If scope, architecture, dependencies, assumptions, or constraints change materially after implementation has started, stop all work. Revert to the Plan stage: update the plan note to reflect the change, confirm with the user, and only then resume implementation. Do not continue under a stale plan even if the user says "keep coding".

- Create apply/task notes: `lifecycle: temporary`, tagged `apply`.
- `role: plan` for executable steps; `role: context` for observations and checkpoints.
- Keep checkbox state current as work advances (`[ ]` → `[x]`), and add new items when scope expands.
- Link to plan note (`follows` for ordered steps).
- For non-trivial work, dispatch a subagent with narrow scope (see [handoff template](#subagent-handoff-template)).
- **Record deviations:** if implementation touches files outside the handoff scope, skips requested validation, or discovers undocumented behavior that changes the approach, flag each deviation in the apply note before continuing. Unflagged deviations become review violations.

### 4. Review (Fresh-Context Subagent Required)

The implementer's own context is contaminated — they designed the code, so they see intent rather than behavior. Review must be performed by a fresh-context subagent that has no prior exposure to the implementation decisions.

**Before writing the review, the orchestrator must:**
1. `get` the research note(s), plan note, and apply/task note(s) linked to this work
2. Read the apply/task note(s) to confirm what actually shipped
3. Extract all explicit constraints from the plan (performance constraints, I/O constraints, fail-soft requirements, schema requirements, etc.) into a constraint checklist

**The review subagent receives the full artifact chain and must:**

**A. Constraint violation hunting (adversarial — prove violations don't exist)**
- Enumerate every explicit constraint from the plan (e.g., "no new I/O on cold paths", "fail-soft to undefined", "always populate contextual metrics", "every Zod field gets `.describe()`")
- For each constraint: cite the exact code path(s) that satisfy it (file, line, or function), or flag it as a violation. A general statement that the constraint is "handled" without a code path citation is insufficient.
- If any constraint is unmentioned in the apply note, flag it — silent omission is a violation

> **Cardinal rule:** Silent omission is a violation. If a planned constraint is not mentioned in the apply note, treat it as a violation until proven otherwise. A missing citation equals an automatic failure — the reviewer must never let a constraint go unaddressed.

**B. Deliverable completeness**
- Does the implementation satisfy every requirement from research?
- Were all planned deliverables completed? If not, why, and is the deferral explicit?
- Are there gaps between what was planned and what was delivered?
- Were any assumptions from research invalidated during implementation?

**C. Fresh verification**
- Every verification command must be run fresh during this review — do not reuse results from implementation
- Record each command, result, and evidence

The review subagent must adopt an adversarial posture: assume violations exist and prove they don't. A review that only confirms what the apply note claims is not sufficient.

**General review principles (borrowed from code-review best practice):**
- Verify every finding by reading the real code path and adjacent files — do not rely on the reviewer's reasoning alone
- Read dependency docs, source types, or external behavior contracts when a finding depends on assumptions about their behavior
- Reject unrealistic edge cases, speculative risks, and fixes that over-complicate the codebase
- Prefer small fixes at the right ownership boundary; no refactor unless it clearly prevents the same bug class
- Include a security perspective, but report security findings only when the change creates a concrete, actionable risk or removes an important safety check — do not let security cripple legitimate functionality
- If rejecting a finding as intentional or not worth fixing, add a brief inline code comment only when it explains a real invariant or ownership decision that future maintainers should know about

Create review notes: `role: review`, `lifecycle: temporary`.
Link to apply/task notes or plan (`derives-from` when conclusions derive from specific artifacts).

**Record outcome as a visible header** — one of:
- `Outcome: continue` — review passed, proceed to consolidation
- `Outcome: block` — review found violations that must be fixed before proceeding
- `Outcome: update plan` — review uncovered issues requiring a plan revision before implementation resumes

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
- **Explicitly remove temporary scaffolding** through consolidation choices when safe. If a temporary note has been distilled into a permanent note, delete or retire the temporary. mnemonic does not auto-expire notes.
- Connect consolidation to commit discipline: consolidation artifacts are **memory** commits and must not be mixed with **work** commits.
- **Regression provenance** (when applicable): for findings that relate to a regression, keep roles separate — blamed code author, blamed PR author, PR merger/committer, current PR author, and PR/date. If no blamed PR is traceable, use the blamed commit SHA, date, and author.

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
6. If a constraint is not mentioned in the apply note, flag it as a potential violation — silent omission is a violation

> **Cardinal rule:** Silent omission is a violation. If a planned constraint is not mentioned in the apply note, treat it as a violation until proven otherwise.

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
