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
updatedAt: '2026-03-26T21:00:32.043Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: git-resilience-retry-contract-concurrency-design-and-languag-351fab47
    type: explains
memoryVersion: 1
---
When a mutating mnemonic operation has already written note or embedding state but git add or commit fails, mnemonic should return an explicit manual recovery contract.

Decision:

- Manual git recovery is allowed only when `mutationApplied=true`.
- Recovery must use only the exact tool-provided commit data.
- Agents must not infer recovery details from git history, note title, summary text, or repo state.
- Plain-text output must render the exact authorized recovery data, not just a generic safe-retry hint.

Recommended contract changes:

- Add a first-class recovery object with a `kind` such as `manual-exact-git-recovery`, `rerun-tool-call`, or `no-manual-recovery`.
- For the allowed manual path, include exact `attemptedCommit.subject`, `attemptedCommit.body`, `attemptedCommit.files`, `vault`, `cwd`, `operation`, and `error`.
- Add explicit instruction flags or equivalent semantics stating:
  - source of truth is `attemptedCommit`
  - use exact subject/body/files
  - do not infer from history
  - do not infer from title or summary
- Rename `attemptedCommit.message` to `attemptedCommit.subject` to make git semantics unambiguous.

Plain-text UX requirement:

- Replace vague text like `Retry: safe | vault=... | files=...` with imperative recovery guidance.
- The text output should explicitly say whether manual recovery is allowed.
- If allowed, it should print the exact commit subject, full body, exact files, and the git failure.
- The text must clearly state that only those exact values are authorized.

Why this is needed:

- Structured retry metadata already exists, but weaker or sloppy models still improvise because the text output is under-specified.
- The tool should be the only source of truth for recovery after partial persistence failures.
- This prevents agents from reverse-engineering commit style from history or inventing their own commit messages.

Acceptance criteria:

- Tool output alone is sufficient for deterministic recovery.
- A model can recover correctly without inspecting git history.
- The allowed recovery action and forbidden inference sources are explicit.
- Exact subject/body/files are visible in both structured and plain-text output.
