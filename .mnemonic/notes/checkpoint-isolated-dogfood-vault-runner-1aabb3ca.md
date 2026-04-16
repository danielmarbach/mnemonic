---
title: 'Checkpoint: isolated dogfood vault runner'
tags:
  - checkpoint
  - temporary-notes
  - dogfooding
  - testing
  - runner
lifecycle: temporary
createdAt: '2026-04-05T17:41:52.947Z'
updatedAt: '2026-04-16T20:58:57.104Z'
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Isolated dogfood vault runner — implemented and merged on 2026-04-16.

Status: DONE. The isolated dogfood runner is implemented and all tests pass.

What was implemented:

- `scripts/dogfooding-isolated-vault.mjs` — `createIsolatedDogfoodVault(sourceVaultPath)` copies notes into a temp directory (excluding `embeddings/` and `projections/`), returns `{ tempRoot, vaultPath, cleanup() }`
- `scripts/dogfooding-isolated-vault.mjs` — `runDogfoodInIsolation({ sourceVaultPath, dryRun })` — orchestrates create + cleanup
- `scripts/dogfooding-runner-helpers.mjs` — `resolveDogfoodVaultPath({ cwd, isolatedVaultPath })` — prefers explicit isolated path over live vault
- `scripts/run-dogfood-packs.mjs` — `--isolated` flag creates a temporary vault copy, points the runner at it, and cleans up afterward; pack result titles include `(isolated vault)` suffix
- Docs: README.md, CONTRIBUTING.md, AGENT.md updated with isolated runner guidance

Tests (9 total across 3 files):

- `tests/dogfooding-isolated-vault.unit.test.ts` — 2 tests: notes copied without modifying source, derived directories excluded
- `tests/dogfooding-runner.unit.test.ts` — 1 new test: isolated vault path preferred over live vault
- `tests/dogfooding-runner.integration.test.ts` — 1 test: creates and cleans up isolated vault around a run

Commits on branch `td-idf`:

- test: add isolated dogfood vault helper
- fix: exclude derived state from isolated dogfood vault
- feat: let dogfood runner target isolated vaults
- feat: isolate dogfooding runs from live vault state
- docs: add isolated dogfood runner guidance
- feat: add --isolated flag to run-dogfood-packs for vault isolation

What this unblocks:

- Running Pack A/B/C against a temporary vault copy so recency and relationship-navigation checks reflect product behavior rather than live-vault noise
- Reproducible dogfooding without polluting the project vault with temporary test artifacts

Historical context (the problem this solved):

- Running against the live vault made recent-note and relationship-navigation checks non-reproducible
- Local vault git/signing issues could produce local-only persistence states irrelevant to the product behavior being dogfooded
- Temporary dogfood notes and active experiment notes polluted recency-driven checks, especially Pack A's recent-to-architecture navigation
