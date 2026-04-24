# Skill: mnemonic-rpi-workflow

# RPIR Workflow: Research -> Plan -> Implement -> Review

Use this skill when work needs structured workflow artifacts in mnemonic.

## When to Use

- Multi-step feature or bugfix work where you need research, plan, execution, and review artifacts.
- Work delegated to subagents that needs explicit handoff and continuity.
- Tasks where plan drift risk is high and you want one current plan note.

## Core Principle

mnemonic is the canonical store for workflow artifacts, not the workflow runtime.

## Stage Checklists

### 1. Research

- Create or update one request root note with `role: context`, `lifecycle: temporary`, `tags: ["workflow", "request"]`.
- Before creating new notes, call `recall` for related prior work.
- Create research notes with `role: research`, `lifecycle: temporary`.
- Distill a short research summary when findings are scattered.
- Link research notes `related-to` request root.

### 2. Plan

- Create or update one current plan note with `role: plan`, `lifecycle: temporary`.
- Link plan note `related-to` request root and key research notes.
- Keep the plan concise, executable, and scoped to the current request.
- Prefer one current plan per request; update or supersede as needed.
- If the plan changes materially, update the plan note before continuing implementation.

Material plan changes include architecture direction, file/module scope, ordering/dependencies, validation strategy, and key assumptions.

### 3. Implement

- Create apply/task notes as `lifecycle: temporary`, tagged with `apply`.
- Use `role: plan` for intended executable steps.
- Use `role: context` for observations, checkpoints, and execution notes.
- Link apply/task notes `related-to` the plan note.
- For non-trivial work, dispatch a subagent with narrow scope and explicit handoff context.

### 4. Review

- Create review notes with `role: review`, `lifecycle: temporary`.
- Link review notes `related-to` apply/task notes or plan.
- Record outcomes: continue, block, or update plan.
- If review causes a material plan change, update plan note first.

### 5. Consolidate

- Create permanent decision note(s) for resolved approaches.
- Create permanent summary note(s) for outcomes and verification.
- Promote reusable patterns into permanent reference notes.
- Let pure temporary scaffolding expire when no longer useful.

## Subagent Handoff Template

Use this template for subagent delegation:

```text
Request note:
- <note-id/title>

Current plan note (or relevant slice):
- <note-id/title>

Relevant research notes:
- <note-id/title>
- <note-id/title>

Durable recalled context:
- <note-id/title>
- <note-id/title>

Task scope:
- Files/modules: <paths>
- Goal: <what to change>
- Validation: <tests/checks>

Subagent must return:
1) Updated apply note content
2) Optional review note content
3) Recommendation: continue | block | update plan
```

## Note Conventions

- Request root: one per workflow, `role: context`, `lifecycle: temporary`, `tags: workflow/request`.
- Apply/task split: no new role; use existing `plan` and `context` roles plus `apply` tag.
- Relationship density: keep sparse; link only to immediate upstream artifacts.
- Plan currency: one current plan note per request.

Canonical graph:

```text
request root (context, temporary)
  -> research (temporary)
  -> plan (temporary)
  -> apply/task (temporary; plan for steps, context for observations)
  -> review (temporary)
  -> outcome/decision/summary (permanent)
```

## Commit Discipline

Use three commit classes through the workflow:

1. Memory commit: research/plan/review artifacts.
2. Work commit: code/test/docs implementation.
3. Memory commit: consolidation and promotion of durable knowledge.

If plan changes materially during implementation, do memory update first, then continue work.

## Examples

### Example 1: Research-heavy bug investigation

- Create request root + two research notes.
- Link research to request.
- Write one plan note with validation steps.
- Execute with apply notes and one review note.
- Consolidate into permanent decision + summary notes.

### Example 2: Multi-file refactor with subagent

- Create request root and concise plan note.
- Hand subagent request/plan/research plus narrow file list.
- Receive updated apply note + recommendation.
- Add review note, update plan if material drift occurred.
- Promote reusable patterns into reference note.

### Example 3: Small task with no iteration

- Create/update request root and one plan note.
- Implement directly with one apply note.
- Review note says continue and close.
- Consolidate to one permanent summary note.
