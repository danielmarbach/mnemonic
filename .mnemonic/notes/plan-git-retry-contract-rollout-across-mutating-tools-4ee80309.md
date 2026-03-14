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
updatedAt: '2026-03-14T20:19:31.634Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Implementation plan to roll out deterministic git retry contracts across mutating MCP tools while keeping changes low-risk and performance-safe.

Goals:

- Return deterministic retry metadata whenever mutation succeeds but commit fails.
- Keep existing success-path behavior unchanged and avoid heavy new I/O or extra git calls.
- Validate each stage with focused tests before each commit.

Stage 1 (foundation, low-risk):

1) Extend git commit status model to represent commit failure without throwing (`failed` + error detail) in `commitWithStatus`.
2) Extend structured persistence model to carry commit failure details and optional retry metadata block.
3) Add helper in `src/index.ts` to build retry payload from attempted commit context (`message`, `body`, `files`, `cwd`, `vault`, `error`) plus `mutationApplied`, `retrySafe`, rationale.
4) Apply foundation to persistence-first mutating paths:
   - `remember`
   - `update`
   - `move_memory` (target commit)
   - `consolidate` `execute-merge` target commit persistence
5) Add/adjust tests for schema and retry data on commit-failure path.

Stage 2 (cross-tool rollout):

1) Apply same retry contract to mutating tools that currently commit without persistence object:
   - `forget`
   - `relate`
   - `unrelate`
   - `set_project_identity`
   - `set_project_memory_policy`
   - `consolidate` prune/source-vault commit paths
2) Ensure each affected tool returns consistent fields and clear text-first error/retry guidance.
3) Add integration coverage for at least one commit-failure scenario per response shape category.

Stage 3 (docs/metadata alignment):

1) If any MCP tool output/annotations/description changes are required, first recall design-guideline memories and align with AGENT conventions.
2) Update `README.md`/`AGENT.md` only where behavior has materially changed.

Stage 4 (release notes):

1) Update `CHANGELOG.md` under `0.10.0` with concise bullets about deterministic git retry contracts across mutating tools.

Execution policy:

- Small commits only, one logical unit per commit.
- Run relevant tests at every stage before committing.
- Keep plan memory updated after each completed stage with status and commit ids.

Performance constraints to respect:

- Avoid additional full-vault scans or repeated note reads in hot paths.
- Keep retry metadata construction constant-time from already available commit context.
- Do not change sync sequencing, commit/push semantics, or introduce broad new concurrency.
