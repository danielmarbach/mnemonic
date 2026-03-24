---
title: 'Sync redesign: decouple embedding from git, force flag, remove reindex'
tags:
  - sync
  - design
  - decision
  - embeddings
lifecycle: permanent
createdAt: '2026-03-24T10:56:06.201Z'
updatedAt: '2026-03-24T10:56:06.201Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
## Decision

Decouple embedding from `hasRemote`. The `hasRemote` gate on embedding was an implementation detail leaking into user-visible behavior — the embedding index is local derived state with no dependency on git.

**Option A chosen** (over B: keep both tools + fix guard; over C: add `skipEmbedding` flag — Ollama failures are already non-fatal).

## New sync contract

```
sync = git ops (if remote) + embed missing (always) + prune stale
sync { force: true } = same, but rebuild ALL embeddings
```

Mental model: **`sync` brings the vault to a fully operational state** — git as fresh as possible, embedding index as complete as possible.

## What changed

1. Removed `if (mainResult.hasRemote)` guard in both vault branches
2. Added `force?: boolean` to `sync` input schema — threads through `backfillEmbeddingsAfterSync` → `embedMissingNotes`
3. `formatSyncResult`: no-remote case says "git skipped" not "nothing to sync" (embedding still runs)
4. Removed `reindex` tool registration from `src/index.ts`
5. Updated integration tests: no-remote sync now shows embedding output; removed reindex test
6. Updated AGENT.md tools table: removed `reindex` row, updated `sync` description

## Tradeoff accepted

No-remote vaults now see embedding output from `sync` — behavior change but an improvement. Users on `DISABLE_GIT=true` setups get embeddings rebuilt via `sync` instead of needing a separate `reindex` call.

## Verification

Implementation verified at three levels: code + docs updated across `src/index.ts`, tests, AGENT, README, ARCHITECTURE, and website; `npm run build` and `tests/git.test.ts` passed; local MCP dogfooding confirmed `sync` attempts embedding backfill when git is skipped and `force` broadens rebuild scope.
