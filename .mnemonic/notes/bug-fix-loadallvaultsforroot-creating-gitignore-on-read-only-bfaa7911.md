---
title: 'Bug fix: loadAllVaultsForRoot creating gitignore on read-only access'
tags:
  - bug
  - vault-routing
  - fix
lifecycle: temporary
createdAt: '2026-03-19T20:39:15.008Z'
updatedAt: '2026-03-19T20:39:15.008Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
## Bug

When a project has `.mnemonic/` directory but no `.mnemonic/.gitignore`, calling `getProjectVaultIfExists()` or any read-only operation that triggers `loadAllVaultsForRoot(create: false)` was incorrectly creating and committing `.gitignore`.

This caused unwanted project vault adoption even when the memory policy was set to `global`.

## Root cause

In `src/vault.ts` lines 173-184, the gitignore initialization code ran unconditionally after the early-return check at line 171. The `create` parameter was not being honored for gitignore creation.

## Fix

Wrapped gitignore creation and commit inside `if (create)` block at line 177:

```typescript
if (create) {
  const gitignorePath = path.join(mnemonicPath, ".gitignore");
  const isNew = !(await pathExists(gitignorePath));
  await ensureGitignore(gitignorePath);

  if (isNew) {
    await primaryVault.git.commit("chore: initialize .mnemonic vault", [".mnemonic/.gitignore"]);
  }
}
```

## Test coverage

Added regression test in `tests/vault.test.ts`:

- "should not create or commit gitignore when loading existing project vault (getProjectVaultIfExists)"

All 253 tests pass.
