---
title: Git retry contract rollout across mutating tools
tags:
  - git
  - retry
  - design
  - resilience
  - mcp-tools
  - completed
lifecycle: permanent
createdAt: '2026-03-14T22:11:19.937Z'
updatedAt: '2026-03-14T22:11:19.937Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mnemonic-git-commit-protocol-standardization-f2ee3d5e
    type: explains
memoryVersion: 1
---
Consolidates design decision + execution plan into one canonical outcome note.

Deterministic git retry metadata now applies across mutating MCP tools when mutation succeeds but commit fails.

Outcome:
- Retry contract is standardized with attempted commit payload (`message`, `body`, `files`, `cwd`, `vault`, `error`), `mutationApplied`, `retrySafe`, and rationale.
- Persistence status now reports commit failures explicitly (`commit=failed`, `commitError`) so clients can recover without reconstructing intent.
- Rollout implemented incrementally across mutation handlers with tests at each stage and no hot-path performance regressions.

Scope covered:
- remember, update, move_memory
- forget, relate, unrelate
- set_project_identity, set_project_memory_policy
- consolidate mutating paths (`execute-merge`, `prune-superseded`)

Validation:
- Focused integration tests cover `index.lock` commit-failure retry payload behavior.
- Full test suite passed after rollout.

Design constraints preserved:
- No extra full-vault scans in hot paths.
- No additional git subprocess calls on success paths.
- Retry metadata assembled from existing in-memory commit context only.
