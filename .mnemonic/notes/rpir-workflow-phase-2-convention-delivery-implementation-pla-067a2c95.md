---
title: RPIR workflow Phase 2 convention delivery implementation plan
tags:
  - workflow
  - rpir
  - implementation
  - phase2
  - plan
lifecycle: temporary
createdAt: '2026-04-23T17:59:43.951Z'
updatedAt: '2026-04-23T17:59:43.951Z'
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Phase 2 convention delivery implementation plan for the RPIR workflow design.

## Scope

Phase 2 delivers the convention layer: MCP prompt, skill file, documentation updates. No core code changes beyond the new prompt registration.

## Tasks

### Task 1: Add mnemonic-rpir-workflow MCP prompt

Register a new `mnemonic-rpir-workflow` prompt in `src/index.ts` after the existing `mnemonic-workflow-hint` prompt. Separate from the workflow-hint prompt because memory protocol and task workflow are different concerns.

Prompt content covers:

- Core principle: mnemonic is artifact store, not runtime
- Request root note convention (role: context, lifecycle: temporary, tags: workflow/request)
- Stage checklists (Research → Plan → Implement → Review → Iterate)
- Apply/task note split (role: plan for steps, role: context for observations, tag: apply)
- Plan currency (one current plan per request)
- Relationship conventions (minimal, immediate upstream only)
- Subagent handoff contract
- Commit discipline (memory, work, consolidation)
- Consolidation at workflow end

### Task 2: Create skills/mnemonic-rpir-workflow/SKILL.md

Skill file with stage checklists, subagent handoff template, commit discipline rules, consolidation guidance, and examples. Follows standard SKILL.md format. Imperative and checklist-driven.

### Task 3: Add integration test for mnemonic-rpir-workflow prompt

Test in `tests/tool-descriptions.integration.test.ts` verifying prompt is accessible and contains required content strings.

### Task 4: Update AGENT.md

- Add RPIR workflow-roles section
- Add mnemonic-rpir-workflow to Prompts table

### Task 5: Update README.md

- Add workflow-roles section describing RPIR stages and role conventions

### Task 6: Run tests and typecheck

- `npm run typecheck`
- `npm test`

## Out of scope for Phase 2

- `recall(mode: "workflow")` (Phase 3)
- Directional relationship types (Phase 3)
- Changes to `role-suggestions.ts` inference logic
