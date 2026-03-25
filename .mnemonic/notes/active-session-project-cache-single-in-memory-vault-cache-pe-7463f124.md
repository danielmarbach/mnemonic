---
title: 'Active session project cache: single in-memory vault cache per MCP session'
tags:
  - architecture
  - performance
  - cache
  - scaling
  - decision
lifecycle: permanent
createdAt: '2026-03-25T12:36:45.634Z'
updatedAt: '2026-03-25T12:36:53.888Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: enrichment-layer-design-provenance-temporal-recall-projectio-7af26f06
    type: related-to
memoryVersion: 1
---
Phase 5 adds a lightweight in-memory session cache (`src/cache.ts`) that eliminates redundant `listNotes()` + `listEmbeddings()` I/O across tool calls within a single MCP session.

## Design

- **Module-level singleton** — `SessionProjectCache` keyed by project ID; no external library, plain TypeScript `Map` objects.
- **Single active project** — only the current project is cached; switching projects silently replaces the cache.
- **Per-vault cache** — each `VaultCache` holds `notesById`, `noteList`, and `embeddings`; built lazily on first access.
- **Eager co-load** — notes and embeddings are loaded together via `Promise.all([listNotes(), listEmbeddings()])` regardless of which accessor triggers the build, so both are always available after one I/O pass.
- **Projection cache** — `projectionsById` stored on `SessionProjectCache` for `NoteProjection` reuse across tools.
- **Fail-soft** — all cache functions return `undefined` on error; callers fall back to direct storage access.
- **Invalidation** — `invalidateActiveProjectCache()` (no-arg) is called by every write-path tool (`remember`, `update`, `forget`, `relate`, `unrelate`, `move_memory`, `consolidate`, `sync`) and on `ensureBranchSynced`.

## Instrumentation

Event log via `console.error`:

- `[cache:miss]` — first access per project/vault
- `[cache:build]` — successful build with `notes=N embeddings=N time=Xms`
- `[cache:hit]` — warm access
- `[cache:invalidate]` — on mutation or project switch
- `[cache:fallback]` — on storage error

Timing hooks added to `recall`, `get`, and `project_memory_summary` via `performance.now()`.

## Integration points in src/index.ts

- `collectVisibleNotes` accepts optional `sessionProjectId`; uses `getOrBuildVaultNoteList` with fallback
- `project_memory_summary` pre-resolves project before `collectVisibleNotes` to supply the cache key
- `recall` uses `getSessionCachedNote` for single-note lookup; `getOrBuildVaultEmbeddings` for embedding list
- `get` checks `getSessionCachedNote` before calling `vaultManager.findNote`

## Testing

29 unit tests in `tests/cache.unit.test.ts` covering: lifecycle, invalidation, note lookup, projection cache, failure handling, and instrumentation (all 6 event types verified without affecting returned data).

## Trade-offs

- No TTL, no LRU — session lifetime is bounded by the MCP process, so no eviction needed.
- Slight redundancy: `project_memory_summary` calls `resolveProject` twice (once to get cache key, once inside `collectVisibleNotes`). Accepted for clean code.
- No cross-tool projection warming — projections must still be computed and stored explicitly per tool call.
