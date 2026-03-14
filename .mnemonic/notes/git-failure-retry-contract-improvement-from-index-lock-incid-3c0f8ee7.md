---
title: Git failure retry contract improvement from index.lock incident
tags:
  - git
  - design
  - retry
  - resilience
  - dogfooding
lifecycle: permanent
createdAt: '2026-03-14T19:57:01.350Z'
updatedAt: '2026-03-14T19:57:01.350Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Learning from 2026-03-14 `index.lock` incident during memory `relate` operation:

Observed behavior:

- Mutation applied (note file updated/staged) but auto-commit failed due to git lock contention.
- Agent could reconstruct a meaningful commit message from operation context + staged diff, but not guaranteed byte-for-byte parity with MCP's internal default commit message/body.

Design goal restated:

- On git failure, MCP should return enough deterministic data to retry commit exactly (or intentionally equivalent) without guessing.

Recommended retry contract additions for mutating tools:

1) Return `retry` block in structuredContent when commit fails after file mutation:
   - `attemptedCommit.message`
   - `attemptedCommit.body`
   - `attemptedCommit.files` (scoped rel paths)
   - `attemptedCommit.cwd`
   - `attemptedCommit.vault`
   - `attemptedCommit.error`
2) Distinguish mutation state explicitly:
   - `mutationApplied: true|false`
   - `persistence.commit.status` remains failed/skipped/written etc.
3) Provide deterministic idempotency hint:
   - `retrySafe: true|false` + rationale (e.g., writes already on disk, only commit failed).

Operational guidance:

- Avoid running two MCP server instances against same repo during mutation-heavy flows; otherwise lock contention is expected.
- If dogfooding is needed, do it in isolation window or different checkout.

Why this matters:

- Keeps failure-recovery aligned with existing scoped-commit safety design.
- Removes ambiguity from manual recovery and preserves audit-quality commit metadata.
