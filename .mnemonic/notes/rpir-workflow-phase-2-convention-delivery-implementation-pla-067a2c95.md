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
updatedAt: '2026-04-24T15:55:30.469Z'
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: phase-2-working-state-and-rpir-convention-delivery-implement-89bf62b7
    type: supersedes
memoryVersion: 1
---
Phase 2 convention delivery implementation status for RPIR workflow design.

## Status

Implementation complete and verified locally.

## Completed

- [x] Added new MCP prompt `mnemonic-rpir-workflow` in `src/index.ts`
- [x] Created skill file `skills/mnemonic-rpir-workflow/SKILL.md`
- [x] Added integration test coverage for prompt availability/content in `tests/tool-descriptions.integration.test.ts`
- [x] Updated `AGENT.md` with RPIR workflow-roles guidance
- [x] Updated prompts table in `AGENT.md` to include `mnemonic-rpir-workflow`
- [x] Updated `README.md` with RPIR workflow conventions section
- [x] Updated prompts table in `README.md` to include `mnemonic-rpir-workflow`
- [x] Ran verification: `npm run build` and `npm test -- tests/tool-descriptions.integration.test.ts` (pass)

## Packaging note

Current npm package `files` list includes only `build`, `CHANGELOG.md`, `README.md`, and `LICENSE`. That means the new skill file under `skills/` is not included in the published npm artifact unless packaging config is expanded.

## Out of scope (unchanged)

- `recall(mode: "workflow")` (Phase 3)
- Directional relationship types (Phase 3)
- Changes to role inference (`role-suggestions.ts`)
