---
title: >-
  mnemonic_relate retry does not reconcile partial git persistence after
  index.lock failure
tags:
  - mnemonic
  - bug
  - retry
  - git
  - persistence
  - mcp
lifecycle: permanent
createdAt: '2026-03-19T22:01:11.193Z'
updatedAt: '2026-03-19T22:01:11.193Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
`mnemonic_relate` can apply a relationship change to note content but fail to fully persist it when git operations hit a transient `.git/index.lock` error in the mnemonic vault.

Observed behavior:

- The semantic mutation succeeds: the `relatedTo` links are written to the note files and the memory graph reflects the new relationships.
- Persistence is only partially completed: some files may be staged, others remain unstaged, and no commit is created.
- A subsequent retry of the same `mnemonic_relate` call returns `Relationship already exists` and does not reconcile the partial git state by staging/committing the remaining files.

Why this looks like a bug:

- The retry contract should either finish the interrupted persistence workflow (`git add` / `git commit`) or surface a distinct status such as "mutation applied but persistence incomplete".
- Current behavior short-circuits on logical relationship existence and skips repository reconciliation.
- This makes the operation non-atomic across note mutation and vault persistence.

Concrete session evidence:

- Four relationship links were added successfully at the content/model level.
- The mnemonic tool reported git errors such as `Unable to create '/Users/danielmarbach/mnemonic-vault/.git/index.lock': File exists` during `git add` / `git commit`.
- Retrying `mnemonic_relate` later reported the relationships already existed, but `/Users/danielmarbach/mnemonic-vault` still showed 2 staged files and 4 modified-but-unstaged files until manually repaired and committed.

Suggested bug report text:
`mnemonic_relate` leaves the mnemonic vault in a partially persisted state if git persistence fails after note mutation (for example due to a transient `.git/index.lock`). Retrying the same relation call reports `Relationship already exists` but does not resume or reconcile the interrupted git workflow. Expected behavior: retries should complete persistence, or the tool should return a specific "persistence incomplete" status with a recovery path.

Repro outline:

1. Start with a clean mnemonic vault.
2. Invoke `mnemonic_relate` on two memories stored in the same vault.
3. Force a transient git failure after note mutation but before persistence completes, for example by creating a competing `.git/index.lock` or otherwise causing `git add` / `git commit` to fail.
4. Observe that note content and the in-memory graph now show the relationship, but the vault repository is left partially updated (for example some files staged, some unstaged, no commit).
5. Retry the exact same `mnemonic_relate` call.
6. Observe that the tool returns `Relationship already exists` and does not repair the partial repository state.
7. Confirm manual `git status` in the mnemonic vault still shows pending changes that require manual staging/commit.

Expected result:

- The retry resumes and completes persistence, or the first failure returns a dedicated incomplete-persistence outcome that preserves recoverability.

Actual result:

- The retry path uses semantic existence as success and ignores git persistence reconciliation.
