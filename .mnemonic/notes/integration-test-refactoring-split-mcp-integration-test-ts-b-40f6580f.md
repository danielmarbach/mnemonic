---
title: 'Integration test refactoring: split mcp.integration.test.ts by theme'
tags:
  - testing
  - refactoring
  - architecture
lifecycle: permanent
createdAt: '2026-03-23T20:25:40.303Z'
updatedAt: '2026-03-24T09:25:53.584Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
After phase 4 merged, split `tests/mcp.integration.test.ts` into themed files and extract shared infrastructure into `tests/helpers/`.

## Why

The monolith had grown to ~50 tests with no internal structure. `relationship-expansion.integration.test.ts` already duplicated the `callTool`/temp-vault boilerplate instead of reusing it, confirming the shared-helpers gap.

## Proposed file split

- `tests/vault-routing.integration.test.ts` — move, project metadata rewrites, vault creation guards
- `tests/project-memory-summary.integration.test.ts` — anchors, suggestedNext, taxonomy warnings, orientation, relatedGlobal
- `tests/memory-lifecycle.integration.test.ts` — remember, update, forget, relate, unrelate, consolidate
- `tests/recall-embeddings.integration.test.ts` — recall backfill, stale re-embed, Ollama down, temporal mode
- `tests/sync-migrations.integration.test.ts` — sync, migrations, schema audit
- `tests/tool-descriptions.integration.test.ts` — workflow-hint, phase-aware wording

## Extract first

Move shared setup (`callLocalMcp`, `createTempVault`, spawn helpers) into `tests/helpers/mcp.ts` before splitting. Once the helper module exists, update `relationship-expansion.integration.test.ts` to use it too.

## Completed

Created `tests/helpers/mcp.ts` with shared infrastructure. Split the monolith into the 6 themed files above. Deleted the original `mcp.integration.test.ts`. All 386 integration tests pass.
