---
title: 'sync tool: per-phase git error surfacing with conflict detection'
tags:
  - git
  - sync
  - resilience
  - structured-content
  - design
  - completed
  - schema
lifecycle: permanent
createdAt: '2026-03-18T07:25:30.436Z'
updatedAt: '2026-03-18T07:25:30.436Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
The `sync` tool previously swallowed all git errors inside a single try-catch, returning empty arrays indistinguishable from a clean no-op sync. A merge conflict during `pull --rebase` was completely invisible to callers.

## What changed

- `SyncResult` in `git.ts` now carries an optional `gitError: SyncGitError` with `phase` ("fetch" | "pull" | "push"), `message`, `isConflict`, and `conflictFiles`.
- `sync()` in `git.ts` handles each phase independently: fetch, pull, push. Each catches its own error and returns `gitError` instead of swallowing.
- Conflict detection: `getConflictFiles()` calls `git.status()` for conflicted files; `messageIndicatesConflict()` checks for "conflict"/"merge"/"rebase" keywords in the error message. Both are checked on pull failure.
- Push phase failure is a partial success: pulled notes are still returned alongside the `gitError`.
- `SyncResult` in `structured-content.ts` has a new `gitError` field per vault entry, and `SyncResultSchema` (Zod) models it with `.optional()`.
- `formatSyncResult` in `index.ts` now renders conflict messages with vault path and actionable guidance ("resolve conflicts in vault-path, then run sync again").
- `vaultResults` type now uses `StructuredSyncResult["vaults"][number]` instead of an inline type to stay in sync with the schema.

## Why this matters

Without this, a merge conflict during sync was a silent no-op. Callers had no way to distinguish "nothing to sync" from "sync failed due to conflict." Following the same robustness principles as the retry contract rollout: failures must be first-class structured results.

## Tests added

- `git.test.ts`: fetch failure returns `gitError.phase = "fetch"`, pull failure with conflicted status returns `isConflict: true` with `conflictFiles`, pull failure via keyword returns `isConflict: true`, push failure returns partial success with pulled notes and `gitError.phase = "push"`.
- `mcp.integration.test.ts`: `SyncResultSchema.parse()` schema audit validates `gitError` optional field is correctly modeled and absent on no-remote vault.
