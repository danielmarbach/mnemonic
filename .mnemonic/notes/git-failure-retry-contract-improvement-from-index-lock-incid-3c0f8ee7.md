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
updatedAt: '2026-03-14T20:15:50.075Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mnemonic-git-commit-protocol-standardization-f2ee3d5e
    type: explains
memoryVersion: 1
---
The git-failure retry contract should apply to **all mutating MCP tools**, not just `relate`.

Core problem (confirmed in the 2026-03-14 `index.lock` incident):

- A mutation can be applied on disk (and staged) while the git commit step fails due to lock contention.
- Without a deterministic retry payload, recovery requires reconstructing commit intent from context, which is not guaranteed byte-for-byte equivalent.

Scope decision:

- Treat this as a platform-level contract for every command that can mutate notes/config/relationships and then attempt git persistence.
- Any mutating command that reaches "mutation applied, commit failed" should emit the same retry contract shape.

Required retry contract on commit failure after mutation:

1) `retry.attemptedCommit`:
   - `message`
   - `body`
   - `files` (scoped relative paths)
   - `cwd`
   - `vault`
   - `error`
2) Mutation-state clarity:
   - `mutationApplied: true|false`
   - keep `persistence.commit.status` explicit (`failed`, `skipped`, `written`, etc.)
3) Idempotency guidance:
   - `retrySafe: true|false`
   - short rationale (for example: writes already persisted; only commit failed)

Mutating tools expected to follow this contract include: `remember`, `update`, `forget`, `move_memory`, `relate`, `unrelate`, mutating `consolidate`, `set_project_identity`, `set_project_memory_policy`, and migration execution paths that persist changes.

Why this matters:

- Makes recovery deterministic and auditable across the whole surface area.
- Avoids tool-specific recovery logic in clients/agents.
- Preserves scoped-commit safety while reducing operational ambiguity during lock/contention failures.
