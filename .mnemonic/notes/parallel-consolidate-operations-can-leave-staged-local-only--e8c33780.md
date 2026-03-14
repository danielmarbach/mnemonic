---
title: >-
  Parallel consolidate operations can leave staged local-only notes without
  actionable retry signal
tags:
  - git
  - retry
  - consolidate
  - persistence
  - concurrency
  - bug
  - lessons
lifecycle: permanent
createdAt: '2026-03-14T23:38:26.947Z'
updatedAt: '2026-03-14T23:38:26.947Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Observed a gap in the git retry/persistence contract during conservative note consolidation on branch `cleanup`.

What happened:

- Four `consolidate.execute-merge` operations were launched in parallel against the same project vault.
- Two completed with auto-commit success.
- Two wrote the canonical note and embedding but returned `git local-only`, leaving new note files staged and uncommitted in the repo.
- The repo state was cleanly recoverable, but the tool result did not make the failure actionable enough for the agent to automatically retry or re-run the operation.

Durable lesson:

- Mutating git-backed operations against the same vault should not be run in parallel unless the tool internally serializes persistence.
- When persistence is partial, the tool should surface commit failure as a first-class structured result with explicit retry guidance.
- Retry should be idempotent and safe when the note content already exists but commit/push did not finish.

Why this matters:

- Content durability and git durability can diverge.
- Agents need enough structured failure detail to distinguish note-write success from commit failure and choose the correct recovery path.
- Silent or weakly-signaled `git local-only` outcomes can leave staged changes behind and create confusion.

Recommended product behavior:

- Return explicit commit failure metadata and retry-safe instructions for partial persistence outcomes.
- Prefer internal serialization for concurrent mutating operations targeting the same vault, or document that callers must serialize them.
- Make redo safe when canonical note creation already happened but git persistence is incomplete.

Recovery used in this session:

- Inspected `git status`
- Verified only two consolidated note files were staged
- Manually committed them with `consolidate(supersedes): finalize canonical rollout memories`
- Working tree returned to clean state
