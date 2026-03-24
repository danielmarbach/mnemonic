---
title: >-
  Git resilience: retry contract, concurrency design, and language-independent
  state detection
tags:
  - git
  - resilience
  - retry
  - concurrency
  - design
  - decision
lifecycle: permanent
createdAt: '2026-03-24T10:53:27.605Z'
updatedAt: '2026-03-24T10:53:27.605Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mnemonic-git-commit-protocol-standardization-f2ee3d5e
    type: explains
  - id: parallel-consolidate-operations-can-leave-staged-local-only--e8c33780
    type: example-of
memoryVersion: 1
---
## Why retry is necessary

Multiple agent sessions (Claude desktop, VSCode plugin, CLI) can concurrently access the same vault with no mutex coordination. This amplifies index.lock probability:

- 10% base lock × 3 concurrent agents ≈ 27% failure rate without retry
- With 3-attempt exponential backoff: ≈ 3% effective failure rate
- Rapid-fire operations (recall → discover_tags → remember → relate) can hit the lock within <100ms

## Retry contract

`git.add()` and `git.commit()` can both fail with index.lock:

- **Add retry**: `addWithRetry()` wraps `git.add()` with 3 retries and exponential backoff (50ms → 100ms → 200ms) for transient lock errors
- **Commit failure**: if add succeeds but commit fails, returns `operation: "commit"`
- **Add exhaustion**: if all add retries fail, returns `operation: "add"`

Retry metadata exposed to callers: `attemptedCommit` payload (`message`, `body`, `files`, `cwd`, `vault`, `error`, `operation`), `mutationApplied`, `retrySafe`, and rationale.

### Scope covered

`remember`, `update`, `move_memory`, `forget`, `relate`, `unrelate`, `set_project_identity`, `set_project_memory_policy`, `consolidate` mutating paths (`execute-merge`, `prune-superseded`).

### Known limitation

Parallel mutating operations against the same vault can still leave partial persistence states (note + embedding written but git only local). **Same-vault mutating operations should be serialized by callers.**

## Language-independent state detection

Never rely on git error message keywords — they are localized and change under different `LANG`/`LC_ALL` settings.

Safe alternatives:

- **`git status --porcelain`** status codes (UU, AA, DD) — not localized, safe to parse; `simple-git`'s `status().conflicted` uses this
- **Git internal state files** — filesystem paths, entirely language-independent:
  - `.git/rebase-merge/` — interactive or `--merge` rebase in progress
  - `.git/rebase-apply/` — `--apply` strategy rebase in progress
  - `.git/MERGE_HEAD` — plain merge conflict

Applied in `GitOps.isConflictInProgress()` in `src/git.ts`: replaced keyword-based fallback with `fs.access` checks on the three paths above.
