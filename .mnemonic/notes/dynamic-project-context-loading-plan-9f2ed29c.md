---
title: Dynamic project context loading plan
tags:
  - plan
  - context-loading
  - scaling
  - future
  - architecture
lifecycle: permanent
createdAt: '2026-03-07T20:51:24.526Z'
updatedAt: '2026-03-07T20:51:25.054Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mnemonic-key-design-decisions-3f2a6273
    type: related-to
  - id: mnemonic-project-overview-and-purpose-763b7a51
    type: related-to
  - id: github-packages-publishing-and-ci-workflow-55495350
    type: related-to
memoryVersion: 1
---
Future direction: add runtime support for loading and unloading active project context so mnemonic can stay simple at small scale while handling larger numbers of projects and memories more efficiently.

- Keep global memories always available, but load project memories on demand.
- Cache active-project embeddings, summaries, and relationship neighborhoods.
- Unload inactive project caches with an LRU or idle-time policy.
- Expand from project-local memories to global memories only when similarity or relationships justify it.
- The goal is better multi-project recall latency and less noise without introducing a heavy always-on database architecture.
