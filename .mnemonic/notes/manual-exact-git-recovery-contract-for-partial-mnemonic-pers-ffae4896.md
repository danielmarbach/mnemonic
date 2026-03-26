---
title: Manual exact git recovery contract for partial mnemonic persistence failures
tags:
  - git
  - retry
  - persistence
  - design
  - mcp-tools
lifecycle: permanent
createdAt: '2026-03-26T20:59:03.983Z'
updatedAt: '2026-03-26T21:46:50.436Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: git-resilience-retry-contract-concurrency-design-and-languag-351fab47
    type: explains
  - id: parallel-consolidate-operations-can-leave-staged-local-only--e8c33780
    type: explains
  - id: mnemonic-git-commit-protocol-standardization-f2ee3d5e
    type: related-to
memoryVersion: 1
---
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
