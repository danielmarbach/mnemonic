---
title: 'Vault creation audit: which tools can create .mnemonic/ and which cannot'
tags:
  - audit
  - vault-routing
  - getOrCreateProjectVault
  - bugs
  - testing
lifecycle: permanent
createdAt: '2026-03-12T15:41:29.294Z'
updatedAt: '2026-03-12T15:41:39.192Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: project-memory-policy-defaults-storage-location-f563f634
    type: related-to
memoryVersion: 1
---
Audit of all cwd-accepting MCP tools against spurious project vault creation. Only three call sites use `getOrCreateProjectVault` — two are intentional, one was a bug (fixed 2026-03-12).

## Safe paths (never create a vault)

All read and lookup operations route through either `findNote` or `collectVisibleNotes`, both of which call `vaultManager.searchOrder(cwd)` → `getProjectVaultIfExists` — which returns null rather than creating when `.mnemonic/` doesn't exist.

- `update` — `findNote` → `getProjectVaultIfExists` (regression test added)
- `forget` — `findNote` → `getProjectVaultIfExists`
- `get` — `findNote` → `getProjectVaultIfExists`
- `where_is_memory` — `findNote` → `getProjectVaultIfExists`
- `relate` / `unrelate` — `findNote` → `getProjectVaultIfExists`
- `list` — `collectVisibleNotes` → `searchOrder` → `getProjectVaultIfExists`
- `recent_memories` — `collectVisibleNotes` → `searchOrder` → `getProjectVaultIfExists`
- `project_memory_summary` — `collectVisibleNotes` → `searchOrder` → `getProjectVaultIfExists`
- `memory_graph` — `collectVisibleNotes` → `searchOrder` → `getProjectVaultIfExists`
- `recall` — `vaultManager.searchOrder` → `getProjectVaultIfExists`
- `sync` — `getProjectVaultIfExists`
- `consolidate` (non-execute-merge strategies) — analysis only, no vault writes

## Intentional creation (by design)

- `remember` — only when `scope` resolves to `"project"` via `resolveWriteVault`
- `move_memory` — only when `target` is explicitly `"project-vault"`

## Fixed bug

`consolidate` strategy `execute-merge` called `getOrCreateProjectVault(cwd)` unconditionally in `executeMerge` (`src/index.ts:3336`), creating `.mnemonic/` in unadopted projects even when all source notes were in main vault. Fixed by switching to `getProjectVaultIfExists`. Regression tests added in `tests/mcp.integration.test.ts`.

## Diagnostic note

If `.mnemonic/` appears unexpectedly in a project, the most likely cause is a prior `consolidate` call with `strategy: "execute-merge"` and `cwd` set — not the tool you happened to be using when you noticed it.

## Key invariant

`getOrCreateProjectVault` must only be called when the user has explicitly expressed intent to write to the project vault (via `scope: "project"` or `move_memory` target). Passing `cwd` for context/lookup must never trigger vault creation.
