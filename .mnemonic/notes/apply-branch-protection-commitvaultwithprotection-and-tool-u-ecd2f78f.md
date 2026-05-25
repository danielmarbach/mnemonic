---
title: 'Apply: branch protection — commitVaultWithProtection and tool updates'
tags:
  - apply
  - branch-protection
  - attachments
lifecycle: temporary
createdAt: '2026-05-25T07:45:34.863Z'
updatedAt: '2026-05-25T07:45:34.863Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
## Apply

Implement `commitVaultWithProtection` helper and wire it into all mutation tools.

### Changes

1. **src/helpers/git-commit.ts**
   - Add `commitVaultWithProtection` helper
   - Uses vault to determine `cwd`, `writeScope`, `projectLabel`, `policy`
   - Calls `shouldBlockProtectedBranchCommit` per vault before `vault.git.commitWithStatus`
   - Returns `{ status: CommitStatus; retry?: MutationRetryContract }`

2. **src/tools/remember.ts**
   - Replace inline `shouldBlockProtectedBranchCommit` + `vault.git.commitWithStatus` with helper

3. **src/tools/update.ts**
   - Replace inline `shouldBlockProtectedBranchCommit` block with helper

4. **src/tools/forget.ts**
   - Remove `touchesProjectVault` + inline check
   - Use helper in vaultChanges loop

5. **src/tools/relate.ts**
   - Add helper in vaultChanges loop (new check for relate)

6. **src/tools/unrelate.ts**
   - Add helper in vaultChanges loop (new check for unrelate)

7. **src/tools/move-memory.ts**
   - Replace inline check with helper

8. **src/tools/consolidate-helpers.ts**
   - Replace two existing `shouldBlockProtectedBranchCommit` calls with helper in commit loops

### Tests

- Unit tests for helper in `tests/git-commit.unit.test.ts`
- Integration tests in `tests/writable-attachment.integration.test.ts`
- Full suite must pass

### Dogfood

- Add protected branch scenario to dogfood scripts
