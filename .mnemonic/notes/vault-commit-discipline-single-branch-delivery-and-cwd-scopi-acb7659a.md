---
title: 'Vault commit discipline: single-branch delivery and cwd scoping'
tags:
  - workflow
  - git
  - vault
  - delivery-protocol
lifecycle: permanent
createdAt: '2026-08-30T11:24:24.264Z'
updatedAt: '2026-08-30T11:24:24.264Z'
role: decision
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Delivery protocol for vault artifacts in this repo, set by a user-directed scope change during the qwen3 chunk-size delivery (2026-08):

- **Single-branch delivery**: memory commits and work commits ride the SAME feature branch as separate commits — no separate `memory/*` branches. Before rebasing memory commits onto work commits, verify the file sets are disjoint (memory commits touch only `.mnemonic/notes/*`).
- **`remember` without `cwd` routes to the main vault** — `resolveWriteScope` needs a resolvable project. Always pass `cwd` for project-scoped notes.
- **Protected-branch policy blocks are correct signals, not obstacles**: do not use `allowProtectedBranch` overrides for routine vault commits on `main`/`master`/`release*`. Vault artifacts do not belong on protected branches.
