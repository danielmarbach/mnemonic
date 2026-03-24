---
title: Git retry contract across mutating tools
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
createdAt: '2026-03-15T14:51:26.688Z'
updatedAt: '2026-03-24T10:53:27.605Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mnemonic-git-commit-protocol-standardization-f2ee3d5e
    type: explains
  - id: parallel-consolidate-operations-can-leave-staged-local-only--e8c33780
    type: example-of
  - id: git-resilience-retry-contract-concurrency-design-and-languag-351fab47
    type: supersedes
memoryVersion: 1
---
Consolidate the retry contract gap fix into the main rollout note

## Git Retry Contract Across Mutating Tools

Deterministic git retry metadata applies across mutating MCP tools when mutation succeeds but git operations fail.

### Outcome

- Retry contract is standardized with attempted commit payload (`message`, `body`, `files`, `cwd`, `vault`, `error`, `operation`), `mutationApplied`, `retrySafe`, and rationale.
- `operation` field indicates whether `git.add()` or `git.commit()` failed, so clients know the correct retry strategy.
- Persistence status reports commit failures explicitly (`commit=failed`, `commitError`, `commitOperation`) so clients can recover without reconstructing intent.
- `git.add()` retries with exponential backoff (50ms → 100ms → 200ms, 3 attempts) for transient index.lock errors before returning failure.

### Scope Covered

- `remember`, `update`, `move_memory`
- `forget`, `relate`, `unrelate`
- `set_project_identity`, `set_project_memory_policy`
- `consolidate` mutating paths (`execute-merge`, `prune-superseded`)

### Implementation Details

Both `git.add()` and `git.commit()` can fail with index.lock:

- **Add retry**: `addWithRetry()` wraps `git.add()` with 3 retries and exponential backoff for transient lock errors
- **Commit failure**: If add succeeds but commit fails, returns `operation: "commit"`
- **Add exhaustion**: If all add retries fail, returns `operation: "add"`

Clients receive:

- `PersistenceStatus.git.commitOperation` — "add" or "commit" 
- `MutationRetryContract.attemptedCommit.operation` — same, for retry contract consumers
- Text output shows "Git add error:" or "Git commit error:" appropriately

### Design Constraints Preserved

- No extra full-vault scans in hot paths.
- No additional git subprocess calls on success paths.
- Retry metadata is assembled from existing in-memory commit context only.

### Lessons from Multi-Agent Usage

Multiple agent sessions amplify index.lock probability:

- 10% base lock × 3 concurrent agents ≈ 27% failure rate without retry
- With retry (3 attempts): ≈ 3% effective failure rate
- Retry with exponential backoff is critical for multi-agent reliability

### Known Limitation

Parallel mutating operations against the same vault can still leave partial persistence states where note content and embeddings are written but git durability is only local. Same-vault mutating operations should be serialized by callers unless the tool internally serializes persistence.

### Validation

- Unit tests cover add retry (transient), add exhaust (persistent lock), commit failure after successful add
- Integration tests verify structured output contains `commitOperation` and `retry.attemptedCommit.operation`
- Full test suite passed after rollout and subsequent gap fix.
