---
title: Mutation push mode defaults for project vault writes
tags:
  - git
  - config
  - sync
lifecycle: permanent
createdAt: '2026-03-10T08:01:03.747Z'
updatedAt: '2026-03-10T08:01:03.747Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
mnemonic now treats push-after-mutation as configurable through the main vault config `mutationPushMode` with values `all`, `main-only`, and `none`. The default is `main-only`: main-vault mutations still auto-push, but project-vault mutations only commit locally so unpublished branches do not fail on remember/update/relate/forget/consolidate. Project vault initialization also commits `.mnemonic/.gitignore` without auto-pushing; `sync` remains the explicit catch-up path for both vault types.
