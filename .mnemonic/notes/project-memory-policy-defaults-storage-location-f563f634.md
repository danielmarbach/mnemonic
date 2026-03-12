---
title: project memory storage policy
tags:
  - policy
  - scope
  - storage
  - ux
  - unadopted
lifecycle: permanent
createdAt: '2026-03-07T19:25:37.785Z'
updatedAt: '2026-03-12T15:36:11.244Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mnemonic-key-design-decisions-3f2a6273
    type: related-to
memoryVersion: 1
---
Decision: project context and storage location are separate, and each project can keep a default write policy so agents only need to ask when necessary.

- `cwd` identifies project context.
- `scope: "project"` stores shared knowledge in `/.mnemonic/`.
- `scope: "global"` stores a private note in the main vault while keeping project association for recall and relationships.
- `remember` uses explicit `scope` first, then the saved project policy, then the fallback behavior.
- `set_project_memory_policy` supports `project`, `global`, and `ask`.
- When the policy is `ask`, agents should present a clear storage selection instead of guessing.
- `update` no longer rewrites project metadata just because `cwd` was passed for lookup.

## Unadopted project detection (added 2026-03-11)

For projects with no saved policy AND no existing `.mnemonic/` directory, `resolveWriteScope()` returns `"ask"` instead of silently creating `.mnemonic/`. This prevents mnemonic from adopting a project without the user's knowledge.

- The `projectVaultExists` boolean is the signal: `false` = unadopted, `true` = already adopted.
- Policy config is stored in `~/mnemonic-vault/config.json` (main vault), not in `.mnemonic/`.
- `projectVaultExists` and `savedPolicy` are distinct: vault existence = adoption signal, policy = persisted preference.
- `remember` handler fetches `getProjectVaultIfExists(cwd)` before calling `resolveWriteScope`.
- `formatAskForWriteScope` differentiates unadopted (first-time) from explicit `ask` policy messages.
- The ask message hints: call `set_project_memory_policy` to avoid being prompted again.
- Explicit `scope` or a saved policy always bypass the unadopted check.

## Consolidate remnant bug (fixed 2026-03-12)

`executeMerge` in `consolidate` was calling `getOrCreateProjectVault(cwd)` whenever `cwd` was passed — even when all source notes lived in main vault. This created `.mnemonic/` in an unadopted project as a side effect.

Fixed by changing line 3336 in `src/index.ts` to `getProjectVaultIfExists(cwd)`. The vault-targeting logic already falls back to `vaultManager.main` when `projectVault` is null, so no consolidation behavior changed.

The `update` path was already safe — it uses `findNote` → `searchOrder` → `getProjectVaultIfExists`, which never creates. When vault creation was observed after an `update` call in a session, it was caused by a prior `consolidate` call in the same session.

Regression tests added in `tests/mcp.integration.test.ts`:

- "does not create a project vault when updating a main-vault note with cwd pointing to unadopted project"
- "does not create a project vault when consolidating main-vault notes with cwd pointing to unadopted project"
