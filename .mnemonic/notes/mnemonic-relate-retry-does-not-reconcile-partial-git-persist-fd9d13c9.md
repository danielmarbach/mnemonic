---
title: mnemonic_relate/unrelate reconcile partial git persistence on retry
tags:
  - mnemonic
  - bug
  - fixed
  - git
  - persistence
  - mcp
lifecycle: permanent
createdAt: '2026-03-19T22:01:11.193Z'
updatedAt: '2026-03-19T22:10:02.637Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
## Issue (Fixed)

`mnemonic_relate` and `mnemonic_unrelate` could apply relationship changes to note content but fail to fully persist when git operations hit a transient `.git/index.lock` error. Retrying returned "Relationship already exists" without reconciling the partial git state.

## Root Cause

When relationships already existed in note content (from a previous failed attempt where note mutation succeeded but git commit failed), the tools short-circuited on the semantic check (`vaultChanges.size === 0`) and returned an error without checking for uncommitted git changes.

## Fix Applied

Both `relate` and `unrelate` now check git status when no content changes are needed:

1. If relationships exist in note content, check `git.status()` for staged or modified files
2. If pending changes are found, commit them and return success
3. Only return "already exists" / "not found" error if both content and git are clean

**Implementation details:**

- Added `GitOps.status()` method that returns `{ staged: string[], modified: string[] }` using `simple-git`'s porcelain status (language-independent)
- Uses `status.staged` and `status.modified` arrays which are porcelain format - safe across locales
- Matches the same pattern used in `isConflictInProgress()` which uses filesystem paths instead of localized messages

## Files Changed

- `src/git.ts`: Added `status()` method
- `src/index.ts`: Updated `relate` and `unrelate` handlers with git reconciliation logic

## Test Coverage

Type check passes. All 255 tests pass.

## Design Principles Followed

- Git state detection uses porcelain format (language-independent)
- Scoped file paths passed to `commitWithStatus` (only mnemonic-managed files)
- Retry contract pattern preserved (builds `MutationRetryContract` when recommitting)
