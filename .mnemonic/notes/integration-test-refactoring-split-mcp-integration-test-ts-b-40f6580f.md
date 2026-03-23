---
title: 'integration test refactoring: split mcp.integration.test.ts by theme'
tags:
  - testing
  - refactoring
  - architecture
lifecycle: permanent
createdAt: '2026-03-23T20:25:40.303Z'
updatedAt: '2026-03-23T20:25:40.303Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
After phase 4 merged, split `tests/mcp.integration.test.ts` into themed files and extract shared infrastructure into `tests/helpers/`.

## Why

The monolith has grown to ~50 tests with no internal structure. `relationship-expansion.integration.test.ts` already duplicated the `callTool`/temp-vault boilerplate instead of reusing it, confirming the shared-helpers gap.

## Proposed file split

- `tests/vault-routing.integration.test.ts` — move, project metadata rewrites, vault creation guards
- `tests/project-memory-summary.integration.test.ts` — anchors, suggestedNext, taxonomy warnings, orientation, relatedGlobal
- `tests/memory-lifecycle.integration.test.ts` — remember, update, forget, relate, unrelate, consolidate
- `tests/recall-embeddings.integration.test.ts` — recall backfill, stale re-embed, Ollama down, temporal mode
- `tests/sync-migrations.integration.test.ts` — sync, migrations, schema audit
- `tests/tool-descriptions.integration.test.ts` — workflow-hint, phase-aware wording

## Extract first

Move shared setup (`callTool`, `createTempVault`, spawn helpers) into `tests/helpers/mcp.ts` before splitting. Once the helper module exists, update `relationship-expansion.integration.test.ts` to use it too.

## Constraint

Do this as a dedicated PR after `phase4` merges to avoid merge conflicts.
