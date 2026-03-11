---
title: >-
  Embedding lazy backfill and staleness detection — implementation
  (consolidated)
tags:
  - embeddings
  - recall
  - architecture
  - decision
  - fixed
lifecycle: permanent
createdAt: '2026-03-11T14:42:57.846Z'
updatedAt: '2026-03-11T14:49:13.373Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Decision: `recall` should lazily backfill missing or stale embeddings on demand so notes become searchable immediately after `git pull` or direct file edits, without requiring an explicit `sync`.

## Implementation

### Staleness detection

In `embedMissingNotes`, skip re-embedding only when the stored embedding uses the current model and its `updatedAt` is at least as new as the note.

Conceptually:

```typescript
if (existing?.model === embedModel && existing.updatedAt >= note.updatedAt)
```

This lets the existing sync path continue to work while also refreshing stale embeddings automatically.

### Pre-recall backfill

Before semantic search, `recall` runs `embedMissingNotes` for each active vault.

Conceptually:

```typescript
for (const vault of vaults) {
  await embedMissingNotes(vault.storage).catch(() => {});
}
```

If embedding generation is unavailable, recall still returns results from already-stored embeddings instead of failing.

### Supporting fix

`parseNote` was updated to normalize YAML timestamps that `gray-matter` may parse as JavaScript `Date` objects when notes arrive via git from another machine. Converting both `Date` and string inputs to ISO strings avoids schema/output validation issues.

## Why this approach

- The MCP server is stdio-based and not always running, so file watching would miss changes between sessions.
- Embeddings are derived data, so rebuilding them lazily at read time is simpler and more reliable than adding a separate watcher or daemon.
- This preserves graceful degradation: recall still works with existing embeddings even if new embedding generation fails.

## Test coverage

Added coverage for:

- recalling a note whose embedding is missing
- recalling a note whose embedding is stale
- recalling successfully when embedding generation is temporarily unavailable

Result: notes become discoverable after pull/edit without a manual sync step.
