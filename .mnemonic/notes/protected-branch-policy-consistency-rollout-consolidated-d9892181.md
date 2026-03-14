---
title: Protected-branch policy consistency rollout (consolidated)
tags:
  - policy
  - git
  - protected-branches
  - implementation
  - consistency
  - release
lifecycle: permanent
createdAt: '2026-03-14T23:34:02.745Z'
updatedAt: '2026-03-14T23:34:02.745Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Merge the protected-branch policy design note and the rollout execution note into one authoritative memory covering both the decision and the shipped behavior.

Protected-branch safeguards were standardized across project-vault mutating tools and rolled out as a single consistent policy.

Durable decision:
- Protected-branch checks should apply consistently to all automatic project-vault commit paths, not just `remember`.
- Policy remains local-only and configurable per project via `protectedBranchPatterns` and `protectedBranchBehavior`.
- `ask`, `block`, and `allow` semantics should behave consistently across `remember`, `update`, `forget`, `move_memory`, and mutating `consolidate` flows.
- One-time override support remains available where applicable through `allowProtectedBranch`.

Implementation outcome:
- Enforcement was extended across the mutating tool surface
- Docs and tool contracts were updated to reflect the shared behavior
- Version and changelog rollout were completed
- Tests verified ask/block/allow behavior and override semantics

This note replaces separate design/plan and rollout-result notes so protected-branch behavior recalls as one canonical implementation record.
