---
title: >-
  Document-source embedding backlog does not resume on re-sync (timeout gap +
  proposed gate fix)
tags:
  - decision
  - attachments
  - document-source
  - embeddings
  - sync
  - timeout
lifecycle: permanent
createdAt: '2026-08-01T23:01:10.246Z'
updatedAt: '2026-08-01T23:01:10.246Z'
role: decision
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
# Document-source embedding backlog does not resume on re-sync (timeout gap + proposed gate fix)

Question raised: on a full document-source sync the MCP tool call can time out. Users can raise `reindexEmbedConcurrency`, but should embedding move to a best-effort background worker? Conclusion: not yet — the real defect is cheaper to fix and a worker is the wrong first lever. Proposed direction below. **Status: not implemented — awaiting sign-off.**

## How embedding runs today

Document-source embedding is synchronous and inline inside the `sync` tool call. Per attachment, `syncDocumentSource` (`src/document-sync.ts:263`): fetch → enumerate → `buildGenerationFromFiles` (pure) → `embedGenerationChunks` (`:156`) → staleness sweep. Key properties:

- `buildGenerationFromFiles` publishes the generation **before** embedding (`src/document-source-index.ts`, calls `publishGeneration` last).
- `embedGenerationChunks` reuses on-disk vectors by content-hash + embedding identity, caps at `DOCUMENT_SOURCE_LIMITS.maxEmbeddingWork = 10000`, recency-orders pending chunks, writes each vector to disk immediately, fail-soft per chunk.
- Generation state is in-memory only (`src/generation-storage.ts`, Map-based); chunk-embedding **files** are the only persisted derived state.

## The precise gap

The fail-soft contract ("embedding failures publish with lexical-only coverage") protects against provider errors. It does **not** protect against client-side MCP timeouts — a timeout kills the call before it returns, so the catch never runs. Data is not lost on timeout (generation is already published lexical-only; embedded chunks are durable on disk). The defect is **backlog resume**:

1. `force` does not reach document-source at all. The sync handler calls `syncDocumentSource(docConfig, ctx, projectEmbeddingsDir)` — no `force`. `force` only threads into note embedding via `backfillEmbeddingsAfterSync(..., force)`. So `sync {force:true}` is a no-op for doc-source.
2. `isGenerationCurrent` (`src/document-sync.ts:67`) short-circuits before any embedding runs and only checks structural validity (commit + extractor/chunker/schema/embedding-identity versions). Once a generation is published at commit X — even with `embeddedChunkCount: 0` — the next sync at X returns `"unchanged"` and the backlog never drains. Re-syncing the same commit, with or without `force`, completes zero additional chunks.

Net: chunk-level embedding is idempotent and de-duplicating (content-hash reuse), but **sync-level backlog resume does not exist today** within a long-lived stdio process. Across a process restart it works incidentally (in-memory generation wiped → rebuild → on-disk vectors reused).

Root cause: `isGenerationCurrent` conflates "structure is valid for this commit" with "embedding is complete." That gate predates incremental embedding (written when doc chunks were lexical-only — see the spec-vs-impl gap note) and treats embedding as part of "done."

## Why not a background worker

The retrieval plan carries an explicit constraint: "no database, daemon, synced index in the source repo." A background worker is the first step toward a daemon and adds process-lifetime, durability, status-reporting, and concurrency hazards (a second `sync` or `remove_attachment` firing while background embedding is mid-flight over the same storage dir). The on-disk vector is already a natural resume cursor, so the real fix is a gate change, not an architecture change.

## Proposed direction (not implemented)

Split "structurally current" from "embedding complete" inside the `isGenerationCurrent` branch of `syncDocumentSource`:

- Still skip the expensive rebuild/enumerate/re-chunk (the win).
- When `embeddedChunkCount < chunkCount - embeddingFailures.length`, run a cheap embed-only pass: reuse the published generation, call `embedGenerationChunks` (reuses on-disk vectors, embeds only the missing ones up to the cap, recency-first). No sweep (same commit → identical chunkId set).
- Report `embeddedChunkCount` / `embeddingFailures` / `pending` so the caller knows whether to sync again.

Each sync drains up to `maxEmbeddingWork` chunks; repeated syncs complete the backlog. The agent is the worker. No daemon, no new concurrency surface.

Pending gate (subtract `embeddingFailures.length`):

```text
pending = embeddedChunkCount < chunkCount - embeddingFailures.length
```

Subtracting failures is deliberate: a permanent failure (chunk too long for the model) recorded once stops triggering backlog passes; otherwise one broken chunk forces a full re-read of every chunk's storage on every sync forever.

## Open design calls (need sign-off before implementing)

1. **Failure semantics** — accept that in-process transient failures won't auto-retry until restart/`force` (cost of the `failures.length` subtraction)?
2. **Status label** — keep `"unchanged"` with delta + pending in message, vs. introduce a distinct status. Lean keep `"unchanged"`.
3. **Structured output** — fold `embeddedChunkCount`/`embeddingFailures`/`pending` into `sync`'s structured doc-source result as part of this change (the five-bugs note flagged doc-source is text-only today), vs. separately. Lean together.
4. **`force` for doc-source** — leave unwired (resume = plain sync). If wired later, mean "rebuild all embeddings ignoring reuse" (opposite of resume), needs a no-reuse flag on `embedGenerationChunks`.
5. **Scope** — this fixes same-process resume only. Does not add lazy recall-time backfill (plan's deferred follow-up) or a persisted failure set. Both orthogonal.

## Verification hooks

- Unit: same-commit re-sync drains the backlog up to the cap; on-disk vectors reused (no re-embed); pending reaches zero across N syncs; permanent failure does not cause perpetual re-reads.
- `embedGenerationChunks` already does the right thing per call — the `isGenerationCurrent` early return is the only thing blocking progress.

## Related

- Derives from `plan-deliver-document-source-chunk-semantic-retrieval-embedd-dba90b71` (the delivered embedding work this finding is about).
- Related to `sync-redesign-decouple-embedding-from-git-force-flag-remove--6f2c1517` (the `force` semantics this finding extends — `force` currently does not reach doc-source).
- Context: `document-source-chunk-embeddings-specified-but-never-deliver-6e867617`.
