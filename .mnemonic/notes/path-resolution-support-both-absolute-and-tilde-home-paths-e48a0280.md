---
title: 'Path resolution: support both absolute and tilde home paths'
tags:
  - path-resolution
  - vault
  - bugfix
  - configuration
lifecycle: permanent
createdAt: '2026-03-11T10:30:20.416Z'
updatedAt: '2026-03-11T10:30:20.416Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Key learning: configuration paths must support both absolute paths and home-directory shorthand (`~`), not just absolute paths.

## Problem observed

Using `path.resolve("~/mnemonic-vault")` does **not** expand `~`; Node treats it as a normal directory name relative to cwd. This can silently point mnemonic to the wrong vault.

## Fix applied

- Added path utilities in `src/paths.ts`:
  - `expandHomePath()` to expand `~`, `~/...`, and `~\\...` using `HOME`/`USERPROFILE`.
  - `resolveUserPath()` to combine home-expansion with absolute resolution.
  - `defaultVaultPath()` and `defaultClaudeHome()` defaults.
- Updated `src/index.ts` to use these helpers for:
  - MCP startup `VAULT_PATH`
  - `migrate` command `VAULT_PATH`
  - `import-claude-memory` `VAULT_PATH` and `CLAUDE_HOME`
- Added `tests/paths.test.ts` to lock behavior for:
  - tilde expansion
  - absolute path pass-through
  - USERPROFILE fallback
  - sane defaults when env is missing

## Rule going forward

All user-configurable filesystem paths should pass through a home-expansion helper before `path.resolve` so both absolute paths and home shorthand work predictably.
