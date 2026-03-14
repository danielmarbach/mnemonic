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
updatedAt: '2026-03-14T22:11:19.937Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: git-retry-contract-rollout-across-mutating-tools-5beda23b
    type: supersedes
memoryVersion: 1
---
Implementation plan to roll out deterministic git retry contracts across mutating MCP tools while keeping changes low-risk and performance-safe.

Status: Completed.

Completed (Stage 1):

- Extended `CommitResult` to include `failed` and error detail without throwing from `commitWithStatus`.
- Kept `commit()` behavior strict by throwing when `commitWithStatus` reports failure.
- Extended structured persistence schema with `git.commitError` and optional `retry` contract.
- Added shared helper in `src/index.ts` to build deterministic retry payloads from commit context.
- Applied to persistence-returning paths: `remember`, `update`, `move_memory` target commit, `consolidate execute-merge` target commit.
- Added integration test for remember commit-failure retry metadata.
- Commit: `300432d`.

Completed (Stage 2):

- Extended result schemas to allow optional retry contract on non-persistence mutating outputs: `ForgetResult`, `RelateResult`, `ConsolidateResult`, `ProjectIdentityResult`, `PolicyResult`.
- Applied retry contract handling to mutating handlers: `set_project_identity`, `set_project_memory_policy`, `forget`, `relate`, `unrelate`, and `consolidate` `prune-superseded`.
- Updated commit/push flow to skip push when commit failed in these paths.
- Added integration coverage for policy commit-failure retry metadata.
- Commit: `ebd10c7`.

Stage 3:

- No tool description or annotation changes were required.

Completed (Stage 4):

- Updated `CHANGELOG.md` (`0.10.0`) with concise entries for deterministic git retry contract and commit-failure persistence visibility.
- Commit: `7f88268`.

Validation evidence:

- Stage 1: `npm test -- tests/git.test.ts tests/mcp.integration.test.ts` (pass)
- Stage 2: `npm test -- tests/git.test.ts tests/mcp.integration.test.ts` (pass)
- Final: `npm test` (232 tests, pass)

Performance constraints respected:

- No added full-vault scans in hot paths.
- No added git subprocess calls on successful paths.
- Retry payload assembly is constant-time from existing commit context.
