---
title: Embedding lazy backfill and staleness detection — implementation
tags:
  - embeddings
  - recall
  - architecture
  - decision
  - fixed
lifecycle: permanent
createdAt: '2026-03-10T19:58:07.203Z'
updatedAt: '2026-03-10T20:02:08.991Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: embedding-lazy-backfill-and-staleness-detection-implementati-235207a1
    type: supersedes
  - id: embedding-lazy-backfill-and-staleness-detection-implementati-b3415cb2
    type: supersedes
  - id: embedding-lazy-backfill-and-staleness-detection-implementati-a416e3f7
    type: supersedes
memoryVersion: 1
---
## What was built

Two minimal changes to make `recall` find notes immediately after a `git pull` or direct editor edit, without requiring an explicit `sync`.

## Changes

### 1. Staleness detection in `embedMissingNotes` (`src/index.ts`)

Extended the skip condition from:

```typescript
if (existing?.model === embedModel)
```

to:

```typescript
if (existing?.model === embedModel && existing.updatedAt >= note.updatedAt)
```

`sync` inherits this for free since it calls `embedMissingNotes` too.

### 2. Pre-recall backfill (`src/index.ts` — `recall` handler)

Added before the search loop:

```typescript
for (const vault of vaults) {
  await embedMissingNotes(vault.storage).catch(() => {});
}
```

If Ollama is down, backfill fails silently and recall still returns results from existing embeddings.

### 3. `parseNote` Date object fix (`src/storage.ts`)

gray-matter parses unquoted ISO timestamps in YAML frontmatter as JS Date objects. Notes written by mnemonic tools are safe. Notes arriving via git pull are affected.

Fixed with a `toIsoString()` helper. Discovered during testing when hand-crafted test notes triggered output validation error 'received date, expected string'.

### 4. `pushWithStatus` now returns instead of throwing (`src/git.ts`, `src/structured-content.ts`)

Push failures previously threw `GitOperationError`, causing all mutating MCP tools to return `isError: true` when a push failed — even though the note was committed successfully. Changed to return `{ status: failed, error }` instead. Added `failed` to the `PushResult` type and `pushError` field to the persistence schema. Discovered during consolidate dogfooding on a branch with no upstream.

## Why lazy backfill (not file watching)

- The MCP server is a stdio process, not always-on. A watcher only runs during an active session — misses pulls between sessions.
- A standalone mnemonic watch daemon would be a separate process requiring user setup.
- Lazy backfill on recall is architecturally consistent: embeddings are derived data and should be rebuilt on demand.

## Tests

- Recall backfills a missing embedding and returns the note
- Recall re-embeds a stale note edited after its embedding was written
- Recall returns existing results when Ollama is down (graceful degradation)
- Push-fail test updated: asserts `status: failed` instead of `rejects.toThrow`

All 162 tests pass.
