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
updatedAt: '2026-03-14T20:26:43.296Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Implementation plan to roll out deterministic git retry contracts across mutating MCP tools while keeping changes low-risk and performance-safe.

Status: Stage 2 completed. Stage 3/4 pending.

Completed (Stage 1):

- Extended `CommitResult` to include `failed` and error detail without throwing from `commitWithStatus`.
- Kept `commit()` behavior strict by throwing when `commitWithStatus` reports failure.
- Extended structured persistence schema with `git.commitError` and optional `retry` contract.
- Added shared helper in `src/index.ts` to build deterministic retry payloads from commit context.
- Applied to persistence-returning paths: `remember`, `update`, `move_memory` target commit, `consolidate execute-merge` target commit.
- Added integration test for remember commit-failure retry metadata.
- Commit: `300432d`.

Completed (Stage 2):

- Extended result schemas to allow optional retry contract on non-persistence mutating outputs:
  - `ForgetResult`, `RelateResult`, `ConsolidateResult`, `ProjectIdentityResult`, `PolicyResult`.
- Applied retry contract handling to remaining mutating handlers:
  - `set_project_identity`
  - `set_project_memory_policy`
  - `forget`
  - `relate`
  - `unrelate`
  - `consolidate` `prune-superseded`
- Updated commit/push flow to skip push when commit failed in these paths.
- Added integration coverage for policy commit-failure retry metadata.
- Commit: `ebd10c7`.

Validation run before stage-2 commit:

- `npm test -- tests/git.test.ts tests/mcp.integration.test.ts`
- Result: pass

Remaining:

- Stage 3: review whether tool descriptions/annotations need changes (only if behavior/documentation contract requires it).
- Stage 4: update `CHANGELOG.md` for `0.10.0`, run final tests, commit.

Performance constraints kept:

- No added full-vault scans in hot paths.
- No added git subprocess calls on successful paths.
- Retry payload assembly remains constant-time from existing commit context.
