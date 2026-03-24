---
title: Sync redesign Option A implemented
tags:
  - plan
  - sync
  - reindex
  - wip
  - implementation
  - dogfood
  - completed
lifecycle: permanent
createdAt: '2026-03-09T20:24:15.195Z'
updatedAt: '2026-03-24T10:56:06.201Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: sync-redesign-decouple-embedding-from-git-force-flag-remove--6f2c1517
    type: supersedes
memoryVersion: 1
---
Implemented sync redesign Option A. The `sync` tool now always runs embedding backfill, accepts `force: true` for full rebuilds, and replaces the separate `reindex` MCP tool.

Verification reached three levels:

- code and docs were updated across `src/index.ts`, tests, AGENT, README, ARCHITECTURE, and the website
- `npm run build` and `tests/git.test.ts` passed
- local MCP dogfooding confirmed that `sync` still attempts embedding backfill when git is skipped and that `force` broadens the rebuild scope

Environment caveats seen during verification were not caused by the sync redesign itself: the sandbox blocked the fake embedding server from binding to `127.0.0.1`, and one git integration setup inherited local signing config.

Follow-up UX correction: the website sync tooltip was rewritten after re-reading the frontend UX note so the copy explains the user benefit instead of implementation details.
