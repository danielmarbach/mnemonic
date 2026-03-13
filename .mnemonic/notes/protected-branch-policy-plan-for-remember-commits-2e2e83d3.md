---
title: Protected branch policy decisions for all project-vault mutating commits
tags:
  - policy
  - git
  - protected-branches
  - feature-49
  - design
  - implementation
  - consistency
lifecycle: permanent
createdAt: '2026-03-13T07:52:12.728Z'
updatedAt: '2026-03-13T09:24:23.240Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Decision update: protected-branch safeguards should apply consistently to all mutating tools that create automatic project-vault commits, not only `remember`.

This extends the original feature direction from `remember`-only protection to cross-tool protection so behavior is predictable and safe on `main`, `master`, and `release*` branches.

## Final policy model

- Detection remains local-only (no GitHub branch protection API calls).
- Policy remains in per-project config under `projectMemoryPolicies`.
- `ProjectMemoryPolicy` continues to use:
  - `protectedBranchPatterns: string[]`
  - `protectedBranchBehavior: "ask" | "block" | "allow"`
- Built-in protected patterns remain: `main`, `master`, `release*`.

## Updated runtime semantics

- Protected-branch checks apply to automatic project-vault commits from all mutating operations that write to project vaults.
- `protectedBranchBehavior: "ask"` returns remediation guidance and one-time override instructions.
- `protectedBranchBehavior: "block"` refuses the commit with clear remediation text.
- `protectedBranchBehavior: "allow"` proceeds normally.
- One-time override (`allowProtectedBranch: true`) remains available where applicable.

## Scope behavior principle

- Explicit user intent should not silently bypass safety in inconsistent ways across tools.
- The same protected-branch posture should hold across `remember`, `update`, `forget`, `move_memory`, and mutating `consolidate` paths whenever they trigger automatic project-vault commits.

## Compatibility stance

- Keep safe defaults for no-policy projects (ask on protected branches).
- Preserve backward compatibility for existing projects by honoring stored behavior unless users change policy explicitly.

## Why this change

The previous remember-only guard left policy gaps in other write/commit paths. Unifying enforcement across mutating tools aligns behavior with user expectations, reduces accidental protected-branch writes, and keeps policy meaning consistent regardless of which mutating tool is used.
