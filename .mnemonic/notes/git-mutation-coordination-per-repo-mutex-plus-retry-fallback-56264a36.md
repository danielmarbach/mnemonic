---
title: 'Git mutation coordination: per-repo mutex plus retry fallback'
tags:
  - git
  - concurrency
  - design
  - retry
  - resilience
lifecycle: permanent
createdAt: '2026-04-05T12:46:05.045Z'
updatedAt: '2026-05-02T04:36:39.168Z'
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: git-resilience-retry-contract-concurrency-design-and-languag-351fab47
    type: explains
  - id: typescript-code-review-mnemonic-project-961d984b
    type: related-to
memoryVersion: 1
---
Approved design: serialize all mutating git operations inside mnemonic with an in-process per-repo async mutex, while keeping bounded retry handling for transient git lock failures.

Why:

- Existing `git.add()` retry hardening reduced transient `.git/index.lock` failures but did not solve same-vault races created by concurrent mnemonic operations.
- Project experience showed same-vault mutating operations should be serialized, while retries remain useful for cross-process contention or any missed edge.

Design:

- Add a small lock registry keyed by canonical `gitRoot`.
- Wrap `GitOps.commitWithStatus()`, `GitOps.pushWithStatus()`, and `GitOps.sync()` in a shared mutation lock.
- Keep read-only git methods unlocked.
- Keep existing retry behavior and broaden it only for lock-shaped failures in mutating phases, with short bounded backoff.
- Use the mutex as the primary same-process coordination mechanism and retry as the fallback for external contention.

Desired behavior:

- Same-repo mutations serialize.
- Different repos can still mutate concurrently.
- Lock release happens in `finally`.
- Failure reporting should continue to use the existing structured retry/recovery contract.

Testing intent:

- Add focused tests proving same-repo mutation serialization.
- Add release-on-error coverage.
- Preserve or extend existing transient lock retry coverage.

This design was explicitly approved for implementation.
