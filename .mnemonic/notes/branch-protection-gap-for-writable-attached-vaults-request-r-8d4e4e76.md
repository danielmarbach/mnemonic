---
title: Branch protection gap for writable attached vaults — request root
tags:
  - workflow
  - request
  - branch-protection
  - attachments
  - phase-3
lifecycle: temporary
createdAt: '2026-05-25T07:27:07.069Z'
updatedAt: '2026-05-25T07:27:07.069Z'
role: context
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
## Request

Implement Option 1: proper per-repo branch protection for writable attached vaults.

## Context

Phase 3 added write-through to attached vaults (remember, update, forget, relate, unrelate on writable attached repos). However, branch protection policy is only enforced on the **consuming project** (the `cwd` repo), not on the attached repo receiving the mutation.

## Gap

When any mutation tool runs, `shouldBlockProtectedBranchCommit` only checks `getCurrentGitBranch(cwd)` against the consuming project's policy. Attached vaults (`project-attached` provenance) are skipped entirely. This means a user on an unprotected `feature/*` branch in their project can silently `forget`, `update`, or `relate` notes on the attached repo's `main` branch, even if that attached repo's `main` would be protected.

## Constraints

- Must work for all mutation tools: remember, update, forget, relate, unrelate, consolidate, move_memory
- Must preserve backward compatibility (consuming project protection stays as-is)
- Must not add new I/O on cold/read-only paths
- Must support `allowProtectedBranch` override per-repo
- Must handle policy resolution for attached vaults independently
- Architecture is project-policy-centric; attached repos are external projects but policy is stored in main vault config keyed by project ID

## Non-scope

- This is about branch protection, not general write permissions (the `writable` flag already gates that)
- No changes to read-path behavior

## Scope

Design and implement per-repo branch protection checks for attached vault mutations as a proper fix (Option 1).
