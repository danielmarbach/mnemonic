---
title: RPIR workflow Phase 3 implementation plan
tags:
  - workflow
  - rpir
  - implementation
  - phase3
  - plan
lifecycle: permanent
createdAt: '2026-04-23T19:14:07.158Z'
updatedAt: '2026-04-25T21:43:29.712Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: rpir-workflow-design-for-mnemonic-research-plan-implement-re-80b00851
    type: example-of
  - id: phase-3-lexical-rescue-optimization-completed-fc722b32
    type: supersedes
memoryVersion: 1
---
Phase 3 implementation plan for RPIR workflow support in mnemonic.

## Status (2026-04-23)

Implementation complete and verified.

## Goal

Ship a single combined Phase 3 with:

1) `recall(mode: "workflow")` chain reconstruction optimized for RPIR workflows
2) additive directional relationship types: `derives-from`, `follows`

## Phase 3 decisions locked in

- Rollout model: always-on (no feature flags)
- Compatibility model: mixed graphs are first-class; fallback from directional/typed edges to `related-to` is supported indefinitely
- Migration model: no schema migration, no bulk relationship rewrite
- Product posture: mnemonic may be used across many external vaults, so legacy compatibility is a long-term contract

## Completed tasks

- [x] Extend relationship type contract with `derives-from` and `follows`
- [x] Extend `relate` validation/tooling to accept new types
- [x] Add `recall(mode: "workflow")` to input schema and execution path
- [x] Implement workflow-mode result selection with RPIR-oriented ranking hints and compatibility fallback behavior
- [x] Add tests for directional type persistence and workflow mode behavior
- [x] Update docs (`README.md`, `AGENT.md`) for workflow mode and new relationship types
- [x] Run verification (`npm run typecheck`, full `npm test`)

## Verification evidence

- Targeted tests pass:
  - `tests/storage.unit.test.ts`
  - `tests/relationship-expansion.integration.test.ts`
  - `tests/recall-embeddings.integration.test.ts`
  - `tests/tool-descriptions.integration.test.ts`
- Full suite pass: 649 tests

## Scope summary

### In scope (done)

- Relationship type extensions (`derives-from`, `follows`)
- Recall workflow mode
- Mixed graph support (legacy + directional)
- Documentation and tests

### Out of scope (unchanged)

- Bulk conversion of old `related-to` edges
- Breaking changes to existing recall modes
- Any orchestration runtime behavior
- Role inference changes

## Functional design summary

### Relationship types

Current + new:

- `related-to`
- `explains`
- `example-of`
- `supersedes`
- `derives-from` (new)
- `follows` (new)

Additive only. Existing note frontmatter remains valid without edits.

### Workflow recall mode

`mode: "workflow"` added to `recall`.

Behavior priorities:

1. directional edges (`derives-from`, `follows`)
2. semantic typed edges (`supersedes`, `explains`, `example-of`)
3. compatibility fallback (`related-to`) — indefinite support

### Backward compatibility

- Existing `default` and `temporal` recall modes remain behaviorally unchanged
- Existing vaults with only legacy edges still reconstruct usable chains in workflow mode
- New edges improve precision, but are optional

## Risk controls

- No destructive rewrites of existing relationships
- Bounded selection to avoid noisy/expensive graph expansion
- Compatibility fallback retained indefinitely for external users

## Follow-up candidates (post-Phase 3)

- Optional helper to suggest directional edges during note authoring
- Optional diagnostics for workflow-chain quality (coverage/ambiguity)
- Phase 4 real-task validation pack focused on RPIR chain quality
- Patch-style note update protocol to reduce token overhead for partial note edits
