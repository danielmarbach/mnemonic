---
title: Embedding lazy backfill and staleness detection — approach decision
tags:
  - decision
  - embeddings
  - recall
  - architecture
  - backfill
lifecycle: permanent
createdAt: '2026-03-10T19:31:51.002Z'
updatedAt: '2026-03-10T19:58:07.203Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: implementation-plan-recall-lazy-backfill-and-staleness-detec-307b2512
    type: explains
  - id: embedding-lazy-backfill-and-staleness-detection-implementati-235207a1
    type: supersedes
  - id: embedding-lazy-backfill-and-staleness-detection-implementati-b3415cb2
    type: supersedes
  - id: embedding-lazy-backfill-and-staleness-detection-implementati-a416e3f7
    type: supersedes
  - id: embedding-lazy-backfill-and-staleness-detection-implementati-eb820222
    type: supersedes
memoryVersion: 1
---
## Decision

Instead of file watching, implement two targeted improvements to keep embeddings current without a background process:

1. **Lazy backfill in `recall`**: before searching, call `embedMissingNotes()` on each vault. Notes that arrived via `git pull` (but were never synced) become visible immediately on the next recall.

2. **Staleness detection in `embedMissingNotes`**: extend the existing skip condition to also re-embed when `embedding.updatedAt < note.updatedAt`. This covers notes edited directly in an editor — the stale embedding is refreshed before recall returns results.

## Why not file watching

- The MCP server is a stdio process, not an always-on service. A watcher only runs during an active session, so it would miss pulls that happen between sessions.
- A standalone `mnemonic watch` daemon would be a separate process requiring user setup — more operational surface than the value justifies at this scale.
- Lazy backfill on recall is architecturally consistent: embeddings are derived data and should be rebuilt on demand.

## Implementation constraints

- Reuse `embedMissingNotes()` directly — no new function needed.
- Modify the staleness skip condition in-place: `if (existing?.model === embedModel && existing.updatedAt >= note.updatedAt)` — one line change.
- Backfill in recall is best-effort: if Ollama is down, recall still returns whatever embeddings exist.
- `sync` inherits the staleness check automatically because it calls `embedMissingNotes()` too.

## Rejected alternatives

- In-process `fs.watch`: only active during session, platform quirks on Linux, adds complexity for marginal gain over lazy backfill.
- Always-on `mnemonic watch` daemon: future option if scale demands it.
