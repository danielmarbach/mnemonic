---
title: 'Plan: Git retry contract rollout across mutating tools'
tags:
  - plan
  - git
  - retry
  - resilience
  - mcp-tools
lifecycle: temporary
createdAt: '2026-03-14T20:19:31.634Z'
updatedAt: '2026-03-14T20:23:23.574Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Implementation plan to roll out deterministic git retry contracts across mutating MCP tools while keeping changes low-risk and performance-safe.

Status: Stage 1 completed. Stage 2 in progress.

Completed (Stage 1):

- Extended `CommitResult` to include `failed` and error detail without throwing from `commitWithStatus`.
- Kept `commit()` behavior strict by throwing when `commitWithStatus` reports failure.
- Extended structured persistence schema with:
  - `git.commitError`
  - optional `retry` contract (`attemptedCommit`, `mutationApplied`, `retrySafe`, `rationale`)
- Added shared helper in `src/index.ts` to build deterministic retry payloads from already-available commit context (constant-time metadata only).
- Applied foundation to persistence-returning mutating paths:
  - `remember`
  - `update`
  - `move_memory` target commit persistence
  - `consolidate` `execute-merge` target commit persistence
- Added integration coverage for commit-failure retry metadata in remember path by forcing `index.lock`.

Validation run before commit:

- `npm test -- tests/git.test.ts tests/mcp.integration.test.ts`
- Result: pass

Committed:

- `300432d` — add deterministic retry metadata for failed mutation commits

Next (Stage 2):

- Apply retry contract shape to remaining mutating tools and multi-vault commit paths:
  - `forget`, `relate`, `unrelate`
  - `set_project_identity`, `set_project_memory_policy`
  - `consolidate` source/prune commit paths
- Add focused integration/schema assertions for new retry outputs.

Performance constraints still enforced:

- No extra vault scans added in hot paths.
- No extra git subprocess calls on success paths.
- Retry metadata built from existing in-memory commit context only.
