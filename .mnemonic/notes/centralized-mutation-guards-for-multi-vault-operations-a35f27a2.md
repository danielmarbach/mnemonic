---
title: Centralized mutation guards for multi-vault operations
tags:
  - principles
  - branch-protection
  - mutations
  - multi-vault
lifecycle: permanent
createdAt: '2026-05-25T17:36:32.760Z'
updatedAt: '2026-05-25T17:36:32.760Z'
role: reference
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
# Centralized Mutation Guards for Multi-Vault Operations

When a single tool call may mutate multiple vaults (for example, relate/unrelate across local and attached vaults, or consolidate spanning multiple sources), branch protection and write-permission checks must be centralized, not duplicated per handler.

## Principle

Extract a single `commitVaultWithProtection` helper that every mutation tool uses. The helper handles:

- Determining if the vault is writable (skip read-only vaults)
- Resolving the correct project ID for policy lookup per vault provenance
- Calling branch protection checks before any git mutation
- Returning a uniform `{ status, retry? }` contract so callers can fail-fast

## Why centralization matters

- Without a shared helper, each tool duplicates `shouldBlockProtectedBranchCommit` logic inline
- Multi-vault mutations (local + attached) need per-vault policy resolution, which is error-prone when scattered across 6+ tool files
- A helper enforces fail-fast semantics consistently: if any vault in a multi-vault operation is protected, abort immediately and return a retry contract for the blocked vault
- Read-only attached vaults should be skipped silently rather than failing, but only the helper knows which vaults are writable

## Design constraints

- Helper must accept `allowProtectedBranch` override parameter and pass it through
- Helper must handle different vault provenances: project-local (policy from consuming project), project-attached (policy from attachment config), main vault (no protection check)
- Helper must leave existing commit scoping unchanged (e.g. notes directory scoped to `.mnemonic/notes`)
- No new I/O on read paths: helper is only called during explicit mutations

## Verification pattern

- Unit tests for helper cover: blocked, override, attached vault, main vault skipped, missing policy fallback
- Integration tests verify end-to-end behavior for each mutation tool across vault types
