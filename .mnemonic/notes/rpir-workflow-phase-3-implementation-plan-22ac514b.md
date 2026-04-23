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
updatedAt: '2026-04-23T19:16:32.125Z'
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: rpir-workflow-design-for-mnemonic-research-plan-implement-re-80b00851
    type: example-of
memoryVersion: 1
---
Phase 3 implementation plan for RPIR workflow support in mnemonic.

## Goal

Ship a single combined Phase 3 with:

1) `recall(mode: "workflow")` chain reconstruction optimized for RPIR workflows
2) additive directional relationship types: `derives-from`, `follows`

## Phase 3 decisions locked in

- Rollout model: always-on (no feature flags)
- Compatibility model: mixed graphs are first-class; fallback from directional/typed edges to `related-to` is supported indefinitely
- Migration model: no schema migration, no bulk relationship rewrite
- Product posture: mnemonic may be used across many external vaults, so legacy compatibility is a long-term contract

## Scope

### In scope

- Extend relationship type contract to include `derives-from` and `follows`
- Extend `relate` validation/tooling to accept new types
- Add `recall(mode: "workflow")` behavior and output shaping
- Add targeted tests for directional-only, legacy-only, and mixed graphs
- Update docs (`README.md`, `AGENT.md`) for workflow mode and relationship semantics

### Out of scope

- Bulk conversion of old `related-to` edges
- Breaking changes to existing recall modes
- Any orchestration runtime behavior
- Role inference changes

## Functional design

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

Add `mode: "workflow"` to `recall`.

Behavior priorities:

1. directional edges (`derives-from`, `follows`)
2. semantic typed edges (`supersedes`, `explains`, `example-of`)
3. compatibility fallback (`related-to`) — indefinite support

Traversal/ranking goals:

- prefer RPIR-relevant roles and immediate upstream/downstream context
- avoid dense expansion; keep output bounded and chain-oriented
- reconstruct useful local workflow neighborhood around top semantic hits

### Backward compatibility

- Existing `default` and `temporal` recall modes remain behaviorally unchanged
- Existing vaults with only legacy edges must still reconstruct usable chains in workflow mode
- New edges improve precision, but are optional

## Implementation tasks

### Task 1 — Extend relationship type model

- Update relationship type union and validators in storage/index schemas
- Ensure parse/write/read of notes accepts new types without side effects

### Task 2 — Extend `relate` tool

- Accept `derives-from` and `follows`
- Keep bidirectional behavior unchanged unless explicitly configured otherwise
- Preserve existing duplicate-edge protection

### Task 3 — Add `recall(mode: "workflow")`

- Extend recall mode schema
- Implement workflow-specific ranking and bounded chain reconstruction
- Maintain fallback ordering and compatibility guarantees
- Keep output compact and predictable for weaker models

### Task 4 — Tests

- Unit tests for relationship type validation and persistence
- Integration tests for `relate` with new types
- Recall workflow-mode tests for:
  - directional-only chain
  - legacy `related-to` chain
  - mixed chain
  - bounded output and stable ordering
- Regression checks that existing recall modes remain unaffected

### Task 5 — Documentation

- Update README relationship type table and recall mode docs
- Update AGENT.md operational guidance for workflow mode + mixed graph expectations
- Clarify that `related-to` fallback is indefinite compatibility behavior

### Task 6 — Verification

- `npm run typecheck`
- `npm test`
- Optional focused dogfood scenario with mixed-edge notes to validate real flow quality

## Acceptance criteria

- `recall(mode: "workflow")` is available and stable
- New directional relationship types are accepted and persisted
- Mixed legacy/new graphs work without migration
- Existing recall modes pass regression
- Full suite green

## Risk controls

- No destructive rewrites of existing relationships
- Bounded traversal to avoid noisy/expensive graph expansion
- Compatibility fallback retained indefinitely for external users

## Follow-up candidates (post-Phase 3)

- Optional helper to suggest directional edges during note authoring
- Optional diagnostics for workflow-chain quality (coverage/ambiguity)
- Phase 4 real-task validation pack focused on RPIR chain quality
