---
title: 'sync redesign: embed always, force flag, remove reindex'
tags:
  - sync
  - reindex
  - design-decision
  - embedding
lifecycle: permanent
createdAt: '2026-03-09T19:54:03.334Z'
updatedAt: '2026-03-24T10:56:06.201Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: sync-redesign-decouple-embedding-from-git-force-flag-remove--6f2c1517
    type: supersedes
memoryVersion: 1
---
Decided to redesign `sync` to always run the embedding step, regardless of whether a git remote exists. The `hasRemote` gate on embedding was an implementation detail leaking into user-visible behavior — the embedding index is local derived state and has no dependency on git.

## Decision

**Option A**: decouple embedding from `hasRemote`, add `force` flag, remove `reindex` tool.

Rejected Option B (keep both tools, fix guard) — near-total overlap after the fix makes two tools confusing.
Rejected Option C (add `skipEmbedding` flag) — Ollama failures are already non-fatal and graceful, so the use case is marginal.

## New sync contract

```text
sync = git ops (if remote) + embed missing (always) + prune stale
sync { force: true } = same, but rebuild ALL embeddings
```

Mental model: **`sync` brings the vault to a fully operational state** — git as fresh as possible, embedding index as complete as possible. Mirrors conventions like `git fetch --force` / `npm install --force`.

## What changes

1. Remove `if (mainResult.hasRemote)` guard in both vault branches of `sync`
2. Add `force?: boolean` to `sync` input schema — thread through `backfillEmbeddingsAfterSync` → `embedMissingNotes`
3. Update `formatSyncResult`: no-remote case says "git skipped" not "nothing to sync" (embedding still runs)
4. Remove `reindex` tool registration from `src/index.ts`
5. Remove `ReindexResultSchema` import from `index.ts` (schema itself can stay in `structured-content.ts`)
6. Remove `StructuredReindexResult` type import from `index.ts`
7. Update integration tests: no-remote sync test now also shows embedding output; remove reindex test
8. Update AGENT.md tools table: remove `reindex` row, update `sync` description
9. Update mnemonic tools inventory memory note

## Tradeoff accepted

No-remote vaults now see embedding output from `sync` — this is a behavior change but an improvement. Users on `DISABLE_GIT=true` setups now get embeddings rebuilt via `sync` instead of needing a separate `reindex` call.
