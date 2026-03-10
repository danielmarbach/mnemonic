---
title: Embedding lazy backfill and staleness detection — implementation
tags:
  - embeddings
  - recall
  - architecture
  - decision
  - fixed
lifecycle: permanent
createdAt: '2026-03-10T19:51:05.637Z'
updatedAt: '2026-03-10T19:51:05.637Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
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

### 3. Bonus bug fix: `parseNote` Date object handling (`src/storage.ts`)

gray-matter parses unquoted ISO timestamps in YAML frontmatter as JS Date objects. Notes written by mnemonic tools are safe. Notes arriving via git pull from another machine are affected.

Fixed with a `toIsoString()` helper:
```typescript
function toIsoString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value) return value;
  return new Date().toISOString();
}
```
Discovered during testing when hand-crafted test notes triggered output validation error 'received date, expected string'.

## Why lazy backfill (not file watching)

- The MCP server is a stdio process, not always-on. A watcher only runs during an active session — misses pulls between sessions.
- A standalone mnemonic watch daemon would be a separate process requiring user setup.
- Lazy backfill on recall is architecturally consistent: embeddings are derived data and should be rebuilt on demand.

## Tests added

- Recall backfills a missing embedding and returns the note
- Recall re-embeds a stale note edited after its embedding was written
- Recall returns existing results when Ollama is down (graceful degradation)

All 162 tests pass.
