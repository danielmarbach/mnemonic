---
title: Mutation push mode defaults for project vault writes
tags:
  - git
  - config
  - sync
lifecycle: permanent
createdAt: '2026-03-10T08:01:03.747Z'
updatedAt: '2026-05-09T21:16:14.023Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: project-memory-policy-defaults-storage-location-f563f634
    type: related-to
memoryVersion: 1
---
mnemonic now treats push-after-mutation as configurable through the main vault config `mutationPushMode` with values `all`, `main-only`, and `none`. The default is `main-only`: main-vault mutations still auto-push, but project-vault mutations only commit locally so unpublished branches do not fail on remember/update/relate/forget/consolidate. Project vault initialization also commits `.mnemonic/.gitignore` without auto-pushing; `sync` remains the explicit catch-up path for both vault types.

Design decision: do not add a per-project push-mode override yet. Push policy is machine-local transport behavior rather than memory semantics, so a single global default is more predictable for users and agents. A future per-project override may be worth adding only if real workflows diverge, and if added it should be a narrow exception for project-vault mutations that falls back to the global default.
