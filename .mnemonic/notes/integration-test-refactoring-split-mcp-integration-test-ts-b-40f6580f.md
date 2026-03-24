---
title: 'Integration tests: organize by domain/theme'
tags:
  - testing
  - refactoring
  - architecture
lifecycle: permanent
createdAt: '2026-03-23T20:25:40.303Z'
updatedAt: '2026-03-24T09:29:07.368Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
## Principle: Group integration tests by domain/theme, not monoliths

Integration tests should be organized by feature domain (vault-routing, memory-lifecycle, recall-embeddings, sync-migrations) rather than accumulating in monoliths.

### Structure

- **Domain test file per feature area** — e.g., `vault-routing.integration.test.ts`, `memory-lifecycle.integration.test.ts`
- **Shared helpers in `tests/helpers/`** — `mcp.ts` for MCP communication (`callLocalMcp`, `callLocalMcpResponse`, `startFakeEmbeddingServer`, `initTestRepo`, `tempDirs` cleanup)
- **Specialized helpers stay local** — tests with schema-specific assertions (like `relationship-expansion`) keep their own helpers alongside domain helpers in `mcp.ts`

### When to split

When a test file exceeds ~50 tests, split by theme. Each themed file should focus on one domain's behavior.

### Files in this project

- `tests/helpers/mcp.ts` — shared MCP communication infrastructure
- `tests/vault-routing.integration.test.ts` — move, project metadata rewrites, vault creation guards
- `tests/project-memory-summary.integration.test.ts` — anchors, orientation, taxonomy warnings, cross-vault visibility
- `tests/memory-lifecycle.integration.test.ts` — remember, update, forget, relate, unrelate, consolidate
- `tests/recall-embeddings.integration.test.ts` — recall backfill, stale re-embed, temporal mode
- `tests/sync-migrations.integration.test.ts` — sync, migrations, schema audit
- `tests/tool-descriptions.integration.test.ts` — workflow-hint prompt, phase-aware wording
- `tests/relationship-expansion.integration.test.ts` — keeps local helpers for specialised schema validation
