---
title: 'Checkpoint: single-branch delivery including memory notes'
tags:
  - workflow
  - apply
lifecycle: temporary
createdAt: '2026-08-15T11:23:22.323Z'
updatedAt: '2026-08-15T11:23:35.798Z'
role: context
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Scope change directed by user after implementation: the work commit and the RPIR memory notes must live on ONE branch, not separate work/memory branches.

Executed: rebased the 7 memory commits from `memory/qwen3-embedding-chunk-size` onto work commit 7179557 and fast-forwarded `feat/embed-max-chunk-chars` (tip now includes notes; memory branch deleted; main untouched at origin/main d337c47). File sets were verified disjoint before the rebase (memory commits touch only `.mnemonic/notes/*`).

Implication for commit discipline going forward: on this repo, memory commits and work commits still remain separate commits, but they ride the same feature branch. Also learned: `remember` without `cwd` routes to the main vault (resolveWriteScope needs a resolvable project) — always pass `cwd` for project-scoped notes; and don't commit vault artifacts on protected `main` (policy blocks were the correct signal, not an obstacle to override).
