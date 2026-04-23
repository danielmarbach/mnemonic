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
updatedAt: '2026-04-23T18:10:08.480Z'
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Phase 2 convention delivery implementation status for RPIR workflow design.

## Status

In progress. Core implementation tasks are complete; verification is running.

## Completed

- [x] Added new MCP prompt `mnemonic-rpir-workflow` in `src/index.ts`
- [x] Created skill file `skills/mnemonic-rpir-workflow/SKILL.md`
- [x] Added integration test coverage for prompt availability/content in `tests/tool-descriptions.integration.test.ts`
- [x] Updated `AGENT.md` with RPIR workflow-roles guidance
- [x] Updated prompts table in `AGENT.md` to include `mnemonic-rpir-workflow`
- [x] Updated `README.md` with RPIR workflow conventions section
- [x] Updated prompts table in `README.md` to include `mnemonic-rpir-workflow`

## Remaining

- [ ] Run typecheck and tests
- [ ] Capture verification results

## Out of scope (unchanged)

- `recall(mode: "workflow")` (Phase 3)
- Directional relationship types (Phase 3)
- Changes to role inference (`role-suggestions.ts`)
