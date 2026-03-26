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
updatedAt: '2026-03-26T21:04:09.139Z'
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

Refined decision:

- Recovery must encode both the authorized action and the precedence between recovery paths.
- If the tool has a deterministic built-in reconciliation path, that path should be preferred over manual git recovery.
- Same-vault recovery and retry operations must be serialized; agents and callers must not replay same-vault mutations in parallel.

Recovery precedence:

1. `rerun-tool-call-serial`
   - Preferred when the tool can reconcile pending persisted mutations safely and deterministically.
   - Must be replayed serially for the affected vault.
2. `manual-exact-git-recovery`
   - Fallback when `mutationApplied=true` and no higher-level deterministic reconciliation path exists.
   - Recovery must use only the exact tool-provided commit data.
3. `no-manual-recovery`
   - Used when neither tool replay nor manual git is safe.

Manual recovery rules:

- Manual git recovery is allowed only when explicitly authorized by the tool.
- Recovery must use only the exact tool-provided commit data.
- Agents must not infer recovery details from git history, note title, summary text, or repo state.
- Plain-text output must render the exact authorized recovery data, not just a generic safe-retry hint.

Recommended contract changes:

- Add a first-class recovery object with a `kind` such as `rerun-tool-call-serial`, `manual-exact-git-recovery`, or `no-manual-recovery`.
- For the allowed manual path, include exact `attemptedCommit.subject`, `attemptedCommit.body`, `attemptedCommit.files`, `vault`, `cwd`, `operation`, and `error`.
- Add explicit instruction flags or equivalent semantics stating:
  - source of truth is `attemptedCommit`
  - use exact subject/body/files
  - do not infer from history
  - do not infer from title or summary
  - do not replay same-vault mutations in parallel
  - prefer tool reconciliation over manual git when available
- Rename `attemptedCommit.message` to `attemptedCommit.subject` to make git semantics unambiguous.

Plain-text UX requirement:

- Replace vague text like `Retry: safe | vault=... | files=...` with imperative recovery guidance.
- The text output should explicitly say whether manual recovery is allowed.
- If allowed, it should print the exact commit subject, full body, exact files, and the git failure.
- The text must clearly state that only those exact values are authorized.
- If a tool replay path is preferred, the text should say to rerun the same tool call serially and explicitly forbid parallel same-vault retries.

Why this refinement is needed:

- Structured retry metadata already exists, but weaker or sloppy models still improvise because the text output is under-specified.
- The tool should be the only source of truth for recovery after partial persistence failures.
- The latest failure showed that even a correct retry path can be misused if same-vault retries are dispatched in parallel.
- This prevents agents from reverse-engineering commit style from history or recreating lock contention during recovery.

Acceptance criteria:

- Tool output alone is sufficient for deterministic recovery.
- A model can recover correctly without inspecting git history.
- Recovery precedence is explicit.
- Same-vault retries are explicitly serialized.
- The allowed recovery action and forbidden inference sources are explicit.
- Exact subject/body/files are visible in both structured and plain-text output when manual recovery is allowed.
