---
title: Protected branch policy plan for remember commits
tags:
  - policy
  - git
  - protected-branches
  - planning
  - feature-49
lifecycle: permanent
createdAt: '2026-03-13T07:52:12.728Z'
updatedAt: '2026-03-13T07:52:12.728Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Feature #49 plan: add protected-branch handling for automatic project-vault commits.

Design decisions:

- Reuse `projectMemoryPolicies` in main vault config.
- Extend project policy with `protectedBranchPatterns` and `protectedBranchBehavior` (`ask` | `block` | `allow`).
- Default patterns: `main`, `master`, `release*`.
- On matching branch during `remember` project-vault write:
  - `ask`: return prompt to either override once or persist `block`/`allow`.
  - `block`: stop commit.
  - `allow`: continue existing behavior.
- No GitHub API dependency; local branch name matching only.

Implementation steps:

1) Extend policy types/config normalization.
2) Detect current branch and pattern match.
3) Add remember-time guard.
4) Add tests for default/prompt/block/allow.
5) Update README/tool docs.
