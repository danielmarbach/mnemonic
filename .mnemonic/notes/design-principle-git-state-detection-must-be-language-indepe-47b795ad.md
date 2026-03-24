---
title: 'Design principle: git state detection must be language-independent'
tags:
  - git
  - design
  - resilience
  - portability
lifecycle: permanent
createdAt: '2026-03-18T07:28:10.692Z'
updatedAt: '2026-03-24T10:53:27.605Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: git-resilience-retry-contract-concurrency-design-and-languag-351fab47
    type: supersedes
memoryVersion: 1
---
When detecting git state (conflicts, rebase in progress, merge state), never rely on error message keywords. Git error messages are localized — they change under different `LANG`/`LC_ALL` settings.

## Language-independent alternatives

- **`git status --porcelain`** status codes (UU, AA, DD, etc.) are not localized — safe to parse. `simple-git`'s `status().conflicted` uses this.
- **Git internal state files** are filesystem paths, not text — entirely language-independent:
  - `.git/rebase-merge/` — interactive or `--merge` rebase in progress
  - `.git/rebase-apply/` — `--apply` strategy rebase in progress
  - `.git/MERGE_HEAD` — plain merge conflict

## What to avoid

Do not check error message strings for words like "conflict", "merge", "rebase", "Konflikt", etc. These are locale-dependent and will silently mis-classify on non-English systems.

## Applied in

`GitOps.isConflictInProgress()` in `src/git.ts` replaced a keyword-based fallback (`messageIndicatesConflict`) with `fs.access` checks on the three git state paths above.
