---
title: 'Design principle: git commits must only touch mnemonic-managed files'
tags:
  - git
  - design-principle
  - bugs
  - commit-scope
lifecycle: permanent
createdAt: '2026-03-12T15:45:37.398Z'
updatedAt: '2026-03-12T15:45:37.398Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Mnemonic's git operations must never commit files outside the vault's own scope, even if such files happen to be staged in the same repository (e.g. source edits made while dogfooding).

## The bug (fixed 2026-03-12)

`GitOps.commitWithStatus` called `this.git.add(files)` to stage specific paths, then called `this.git.commit(message)` with no file arguments — which commits **all currently staged files**, not just the ones just added. This caused commit `d97583f5` to include `src/index.ts` and `tests/mcp.integration.test.ts` alongside the note it was supposed to commit.

## The fix (`src/git.ts`)

Compute a `scopedFiles` list before the add, use it for both `add` and `commit`:

```typescript
const scopedFiles = files.length > 0 ? files : [`${this.notesRelDir}/`];
await this.git.add(scopedFiles);
// ... staged check ...
await this.git.commit(fullMessage, scopedFiles);
```

`simple-git`'s `commit(message, files)` maps to `git commit -- <files>`, scoping the commit to only those paths.

## The invariant

- With explicit files: `git add <files>` + `git commit -- <files>`
- Without files (fallback): `git add <notesRelDir>/` + `git commit -- <notesRelDir>/`

Either way, no file outside the vault's own directory can end up in a mnemonic commit.

## Test coverage (`tests/git.test.ts`)

- "passes explicit file paths to git commit so stray staged files are never swept in"
- "falls back to notesRelDir/ when no files are specified, scoping the commit to the notes directory"
