---
title: 'Git resilience: per-repo mutex, retry contract, and manual recovery'
tags:
  - git
  - concurrency
  - design
  - retry
  - resilience
  - decision
  - persistence
  - mcp-tools
lifecycle: permanent
createdAt: '2026-09-27T20:54:38.034Z'
updatedAt: '2026-09-27T20:54:38.034Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mnemonic-git-commit-protocol-standardization-f2ee3d5e
    type: explains
  - id: parallel-consolidate-operations-can-leave-staged-local-only--e8c33780
    type: example-of
  - id: sync-tool-per-phase-git-error-surfacing-with-conflict-detect-ce15062e
    type: derives-from
  - id: automatic-branch-change-detection-and-sync-89f4da23
    type: related-to
  - id: parallel-consolidate-operations-can-leave-staged-local-only--e8c33780
    type: explains
  - id: mnemonic-git-commit-protocol-standardization-f2ee3d5e
    type: related-to
memoryVersion: 1
---
## Consolidated from:
### Git mutation coordination: per-repo mutex plus retry fallback
*Source: `git-mutation-coordination-per-repo-mutex-plus-retry-fallback-56264a36`*

Approved design: serialize all mutating git operations inside mnemonic with an in-process per-repo async mutex, while keeping bounded retry handling for transient git lock failures.

Why:

- Existing `git.add()` retry hardening reduced transient `.git/index.lock` failures but did not solve same-vault races created by concurrent mnemonic operations.
- Project experience showed same-vault mutating operations should be serialized, while retries remain useful for cross-process contention or any missed edge.

Design:

- Add a small lock registry keyed by canonical `gitRoot`.
- Wrap `GitOps.commitWithStatus()`, `GitOps.pushWithStatus()`, and `GitOps.sync()` in a shared mutation lock.
- Keep read-only git methods unlocked.
- Keep existing retry behavior and broaden it only for lock-shaped failures in mutating phases, with short bounded backoff.
- Use the mutex as the primary same-process coordination mechanism and retry as the fallback for external contention.

Desired behavior:

- Same-repo mutations serialize.
- Different repos can still mutate concurrently.
- Lock release happens in `finally`.
- Failure reporting should continue to use the existing structured retry/recovery contract.

Testing intent:

- Add focused tests proving same-repo mutation serialization.
- Add release-on-error coverage.
- Preserve or extend existing transient lock retry coverage.

This design was explicitly approved for implementation.

### Git resilience: retry contract, concurrency design, and language-independent state detection
*Source: `git-resilience-retry-contract-concurrency-design-and-languag-351fab47`*

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

### Manual exact git recovery contract for partial mnemonic persistence failures
*Source: `manual-exact-git-recovery-contract-for-partial-mnemonic-pers-ffae4896`*

When a mutating mnemonic operation has already written note or embedding state but git add or commit fails, mnemonic should return an explicit recovery contract.

Status: implemented.

Implemented outcome:

- `MutationRetryContract` now includes a first-class `recovery` object with `kind`, `allowed`, and `reason`.
- The contract now includes explicit `instructions` metadata covering source of truth, exact-value usage, no-inference rules, same-vault serialization, and preference for tool reconciliation.
- Retry metadata now uses `attemptedCommit.subject` instead of `attemptedCommit.message`.
- Plain-text retry output is now imperative and recovery-specific instead of generic `Retry: safe` text.

Implemented recovery precedence:

1. `rerun-tool-call-serial`
   - Preferred when the tool can reconcile pending persisted mutations safely and deterministically.
   - Implemented for `relate` and `unrelate` reconciliation paths.
2. `manual-exact-git-recovery`
   - Fallback when `mutationApplied=true` and no higher-level deterministic reconciliation path exists.
3. `no-manual-recovery`
   - Reserved for cases where neither tool replay nor manual git is safe.

Manual recovery rules:

- Manual git recovery is allowed only when explicitly authorized by the tool.
- Recovery must use only the exact tool-provided commit data.
- Agents must not infer recovery details from git history, note title, summary text, or repo state.
- Plain-text output renders the exact authorized recovery data instead of a generic safe-retry hint.

Preview-mode API decision:

- The preview contract now exposes only `attemptedCommit.subject`.
- The temporary compatibility alias back to `attemptedCommit.message` was intentionally removed because the project is still in preview and the cleaner contract is preferable now.

Plain-text UX now does the following:

- For `manual-exact-git-recovery`, prints the exact commit subject, full body when present, exact files, and the git failure, together with an explicit no-inference warning.
- For `rerun-tool-call-serial`, instructs callers to rerun the same tool call serially and explicitly forbids replaying same-vault mutations in parallel.

Files changed for the implementation:

- `src/index.ts`
- `src/structured-content.ts`
- `tests/memory-lifecycle.integration.test.ts`
- `CHANGELOG.md`

Verification evidence from implementation:

- Focused retry-contract tests passed.
- Typecheck passed.
- Sequential full-suite runs still showed intermittent unrelated MCP integration flakiness (`Missing tool response` / truncated JSON style failures), but the affected integration files passed when rerun in isolation. The implemented retry-contract change itself verified cleanly in focused coverage.

Why this matters:

- The tool is now much closer to being the sole source of truth for recovery after partial persistence failures.
- Tool-specific reconciliation paths now outrank manual git when available.
- The output now explicitly teaches weaker models what to do and what not to do.
