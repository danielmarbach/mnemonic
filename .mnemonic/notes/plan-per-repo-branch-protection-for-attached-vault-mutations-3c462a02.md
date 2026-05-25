---
title: 'Plan: Per-repo branch protection for attached vault mutations'
tags:
  - workflow
  - plan
  - branch-protection
  - attachments
lifecycle: temporary
createdAt: '2026-05-25T07:36:44.244Z'
updatedAt: '2026-05-25T07:36:44.244Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
## Plan

Implement per-repo branch protection for all mutation tools touching attached vaults.

## User confirmed decisions

1. relate and unrelate also get protected branch checks for project-local vaults (fixing pre-existing gap)
2. Centralize into `commitVaultWithProtection` helper

## New helper: commitVaultWithProtection

Located in `src/helpers/git-commit.ts` alongside existing `shouldBlockProtectedBranchCommit`.

Signature:

```typescript
async function commitVaultWithProtection(options: {
  ctx: ServerContext;
  vault: Vault;
  commitMessage: string;
  files: string[];
  commitBody?: string;
  allowProtectedBranch: boolean;
  toolName: string;
  noteProjectId?: string; // for policy lookup
}): Promise<{ status: CommitStatus; retry?: MutationRetryContract }>
```

Logic:

1. If `!vault.writable`, return skipped (read-only)
2. Determine vault cwd:
   - `project-local`: resolve from vault storage path
   - `project-attached`: use `attachmentRef.localPath`
   - `main`: main vault path
3. If main vault or writeScope is not project, skip protection check
4. Resolve project ID for policy lookup:
   - `project-local`: use `noteProjectId` parameter
   - `project-attached`: use `vault.attachmentRef.projectSlug`
5. Call `shouldBlockProtectedBranchCommit` with vault-specific cwd and project
6. If blocked, return failed status with retry contract
7. If not blocked, call `vault.git.commitWithStatus` and return result

## Per-tool changes

- **remember.ts**: Replace inline `vault.git.commitWithStatus` with `commitVaultWithProtection`
- **update.ts**: Remove inline `shouldBlockProtectedBranchCommit` block, use helper
- **forget.ts**: Remove `touchesProjectVault` + inline check, use helper in vaultChanges loop
- **relate.ts**: Add helper in vaultChanges loop (new check)
- **unrelate.ts**: Add helper in vaultChanges loop (new check)
- **move-memory.ts**: Replace inline check with helper
- **consolidate-helpers.ts**: Replace two existing calls with helper

## Fail-fast behavior

If any vault is blocked during multi-vault operations, fail immediately. Return error with retry contract for blocked vault. User should fix branch before retrying.

## Constraints

- No new I/O on cold paths: helper only called during mutations
- Backward compatible: consuming project behavior unchanged
- Git commit scoping: helper uses scopedFiles same as before

## Edge cases

- Multiple vaults mixed protection: fail-fast on first blocked vault
- Attached vault policy not configured: falls back to default (no protection)
- Working tree branch different from configured read branch: checks working tree (correct)
- Main vault mutations: no protection check (existing behavior)

## Test plan

- Unit tests in `tests/git-commit.unit.test.ts` for helper:
  - project-local vault on protected branch blocked
  - project-local vault on protected branch with allowProtectedBranch override
  - project-attached vault on protected branch blocked
  - project-attached vault with allowProtectedBranch override
  - main vault skipped (no check)
  - missing policy falls back to no protection
  - non-writable vault skipped
- Integration tests in `tests/writable-attachment.integration.test.ts`:
  - update on attached vault with protected branch fails
  - forget on attached vault with protected branch fails
  - relate on attached vault with protected branch fails
  - allowProtectedBranch override succeeds
- Full test suite must pass
- Dogfood script: add protected branch scenario
