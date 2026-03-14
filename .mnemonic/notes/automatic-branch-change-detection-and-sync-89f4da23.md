---
title: Automatic branch change detection and sync
tags:
  - git
  - branch-switch
  - sync
  - automation
lifecycle: permanent
createdAt: '2026-03-14T22:41:26.358Z'
updatedAt: '2026-03-14T23:12:08.871Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Automatic branch change detection and sync now applies to `cwd`-aware memory operations plus migration execution, not literally every tool.

When a developer switches git branches and then calls a `cwd`-aware read/write memory tool or `execute_migration`, mnemonic detects the branch change and automatically syncs vaults so embeddings stay current without requiring a manual `sync` first.

Implementation approach:

- `src/branch-tracker.ts` stores the last-seen branch per `cwd`
- `checkBranchChange(cwd)` compares the current git branch to that cached value and returns the previous branch only when it actually changed
- `ensureBranchSynced(cwd)` in `src/index.ts` triggers vault sync plus embedding backfill only after a detected branch change
- Runtime overhead stays bounded to one branch lookup per `cwd` per tool call; sync and embedding rebuild happen only on actual branch changes

Current tool coverage:

- `execute_migration`
- `remember`
- `recall`
- `update`
- `forget`
- `get`
- `where_is_memory`
- `list`
- `recent_memories`
- `memory_graph`
- `project_memory_summary`
- `move_memory`
- `relate`
- `unrelate`
- `consolidate`

Behavioral impact:

- First call for a `cwd`: record branch, no sync yet
- Later calls on same branch: one branch check, no sync
- First call after a branch switch: sync main/project vaults and backfill embeddings before serving the request
- This matches the intended low-overhead design noted during performance review: minimal steady-state git work with correctness restored on branch changes

Test and correctness follow-up:

- Removed the broken `hasBranchChanged` helper because it compared the same cached value to itself and could never report a change
- Added direct unit tests around `checkBranchChange` plus MCP integration coverage to verify the runtime path

Files involved:

- `src/branch-tracker.ts`
- `src/index.ts`
- `tests/branch-tracker.test.ts`
- `tests/mcp.integration.test.ts`
