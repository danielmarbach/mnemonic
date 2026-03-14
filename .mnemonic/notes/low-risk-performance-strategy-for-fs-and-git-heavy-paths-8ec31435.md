---
title: Low-risk performance strategy for fs and git heavy paths
tags:
  - decision
  - performance
  - io
  - git
  - safety
lifecycle: permanent
createdAt: '2026-03-14T19:42:51.098Z'
updatedAt: '2026-03-14T19:51:00.934Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: performance-principles-for-file-first-mcp-and-git-backed-wor-4fb3701c
    type: supersedes
memoryVersion: 1
---
Design decision for this optimization pass: target duplicate work elimination first, then selective local caching, and only then safe parallelism in independent file reads.

Prioritized categories:

1) remove repeated note/embedding reads in `recall` and `consolidate` analysis loops,
2) reduce repeated filesystem scans/parses in `Storage.listNotes`/`Storage.listEmbeddings`,
3) reduce duplicate git-root/project-resolution subprocess calls where the same `cwd` is resolved multiple times in one flow.

Explicitly deferred for safety: changing git sync sequencing, changing commit/push semantics, and broad concurrency changes in mutation paths.
