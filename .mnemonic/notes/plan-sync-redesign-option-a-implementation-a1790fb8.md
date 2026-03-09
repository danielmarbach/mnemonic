---
title: 'plan: sync redesign Option A implementation'
tags:
  - plan
  - sync
  - reindex
  - wip
lifecycle: temporary
createdAt: '2026-03-09T19:54:04.937Z'
updatedAt: '2026-03-09T20:20:43.704Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Implemented the core Option A redesign in code and docs. `sync` now always runs embedding backfill, accepts `force: true`, and the dedicated `reindex` MCP tool has been removed.

## Completed

- [x] Remove `hasRemote` guard around embedding backfill in the main vault sync path
- [x] Remove `hasRemote` guard around embedding backfill in the project vault sync path
- [x] Add `force?: boolean` to the `sync` input schema
- [x] Thread `force` through sync embedding backfill
- [x] Update sync no-remote wording to say git sync was skipped
- [x] Remove the `reindex` tool registration from `src/index.ts`
- [x] Remove `ReindexResultSchema` and `StructuredReindexResult` imports from `src/index.ts`
- [x] Update MCP integration tests for no-remote sync embedding behavior and force sync rebuild behavior
- [x] Update docs and website tool inventory for sync-only embedding rebuild behavior

## Verification

- [x] `npm run build`
- [x] `npm test -- tests/git.test.ts tests/mcp.integration.test.ts` partially validates the change surface
- [ ] MCP integration tests are fully green in this environment

## Verification notes

The integration run hit environment issues unrelated to the sync redesign:

- binding the fake embedding HTTP server fails in this sandbox with `listen EPERM: operation not permitted 127.0.0.1`
- one git-based integration setup inherits local signing config and fails its seed commit with `1Password: Could not connect to socket`

## Remaining

- [ ] Dogfood `sync` via the local MCP with and without `force`
- [ ] Capture the implementation outcome note and consolidate this temporary plan into a durable summary note
