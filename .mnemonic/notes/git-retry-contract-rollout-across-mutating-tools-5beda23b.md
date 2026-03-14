---
title: Git retry contract rollout across mutating tools
tags:
  - git
  - retry
  - design
  - resilience
  - mcp-tools
  - completed
  - concurrency
  - persistence
lifecycle: permanent
createdAt: '2026-03-14T22:11:19.937Z'
updatedAt: '2026-03-14T23:40:42.212Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mnemonic-git-commit-protocol-standardization-f2ee3d5e
    type: explains
memoryVersion: 1
---
Deterministic git retry metadata applies across mutating MCP tools when mutation succeeds but commit fails.

Outcome:

- Retry contract is standardized with attempted commit payload (`message`, `body`, `files`, `cwd`, `vault`, `error`), `mutationApplied`, `retrySafe`, and rationale.
- Persistence status reports commit failures explicitly (`commit=failed`, `commitError`) so clients can recover without reconstructing intent.
- Rollout was implemented incrementally across mutation handlers with tests at each stage and no hot-path performance regressions.

Scope covered:

- `remember`, `update`, `move_memory`
- `forget`, `relate`, `unrelate`
- `set_project_identity`, `set_project_memory_policy`
- `consolidate` mutating paths (`execute-merge`, `prune-superseded`)

Validation:

- Focused integration tests cover `index.lock` commit-failure retry payload behavior.
- Full test suite passed after rollout.

Design constraints preserved:

- No extra full-vault scans in hot paths.
- No additional git subprocess calls on success paths.
- Retry metadata is assembled from existing in-memory commit context only.

Important limitation learned later:

- Parallel mutating operations against the same vault can still leave partial persistence states where note content and embeddings are written but git durability is only local.
- In that scenario, a generic `git local-only` outcome is not actionable enough for automatic recovery.
- Same-vault mutating operations should be serialized by callers unless the tool internally serializes persistence.
- Retry handling must remain idempotent when canonical note creation already succeeded but commit or push did not.

This remains the canonical retry-contract note; concrete incident memories should attach as examples when they reveal edge cases the contract must account for.
