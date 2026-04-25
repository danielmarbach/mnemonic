---
name: mnemonic-rpir-workflow
description: Executes multi-step research-plan-implement-review workflows using mnemonic for workflow artifacts. Triggers on multi-step feature or bugfix work, subagent handoffs, plan-heavy tasks, or any work needing structured RPIR artifacts with explicit handoffs and consistent role/relationship conventions.
---

# RPIR Workflow: Research → Plan → Implement → Review

## Core Principle

mnemonic stores workflow artifacts; it does not run the workflow.

## Relationship Conventions

Use `derives-from` for lineage and `follows` for sequence by default. Fall back to `related-to` only when direction is unclear. Keep relationships sparse — link only to immediate upstream artifacts.

## Stage Checklists

### 1. Research

- Create or update one request root: `role: context`, `lifecycle: temporary`, `tags: ["workflow", "request"]`.
- Call `recall` before creating notes to avoid duplicates.
- Create research notes: `role: research`, `lifecycle: temporary`.
- Distill when findings are scattered.
- Link research to request root (`derives-from` preferred).

### 2. Plan

- Create or update one current plan note: `role: plan`, `lifecycle: temporary`.
- Link to request root and key research notes (`derives-from` for lineage, `follows` for sequence).
- Keep the plan concise and executable.
- One current plan per request; update or supersede as needed.
- Update plan note before continuing if scope, architecture, dependencies, or assumptions change materially.

### 3. Implement

- Create apply/task notes: `lifecycle: temporary`, tagged `apply`.
- `role: plan` for executable steps; `role: context` for observations and checkpoints.
- Link to plan note (`follows` for ordered steps).
- For non-trivial work, dispatch a subagent with narrow scope (see [handoff template](#subagent-handoff-template)).

### 4. Review

- Create review notes: `role: review`, `lifecycle: temporary`.
- Link to apply/task notes or plan (`derives-from` when conclusions derive from specific artifacts).
- Record outcome: continue, block, or update plan.
- If review causes a material plan change, update plan note first.
- Every review note must include verification evidence:

```text
- Command: <run command>
- Result: pass | fail | partial
- Details: <counts, errors>
```

### 5. Consolidate

- Create permanent decision note(s) and summary note(s).
- Promote reusable patterns into permanent reference notes.
- Let temporary scaffolding expire.

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