---
title: Bounded concurrency and single-source-of-truth principles
tags:
  - concurrency
  - design
  - principles
  - typescript
  - refactoring
  - performance
lifecycle: permanent
createdAt: '2026-08-05T00:00:00.000Z'
updatedAt: '2026-08-05T00:00:00.000Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: performance-principles-for-file-first-mcp-and-git-backed-wor-4e7d3bc8
    type: derives-from
  - id: implementation-principles-for-mnemonic-mcp-2e178bba
    type: related-to
  - id: typescript-development-principles-for-mcp-servers-1dc01593
    type: related-to
memoryVersion: 1
---
## Bounded concurrency: one shared primitive, not five hand-rolled pools

When mapping independent async work over a collection with bounded concurrency, use the shared `mapWithConcurrency` in `src/concurrency.ts`. It is order-preserving (each result is placed at its source index) and result-returning.

### Rules
- Return a value per item and reduce post-loop. Express a skip as a `null` sentinel filtered after, not a `continue` inside the loop.
- Do NOT mutate shared arrays or Maps from inside the per-item function. That reintroduces the nondeterministic-completion-order problem the primitive exists to remove (and forces a "sort afterward for determinism" step).
- Keep each call site's own concurrency constant / config knob (the bound is domain-specific: bulk file reads, embedding backfills, note hydration all want different limits).

### When to keep a hand-rolled side-effect pool (prefer duplication)
Reserve a hand-rolled `Array.from({ length }, async () => { while (true) { ... } })` pool for the case where the per-item body has an intrinsic side effect on a shared structure that cannot be expressed as a return value without a tagged-union dispatch that obscures the real axis of change. Example: `embedGenerationChunks` in `src/document-sync.ts` mutates a shared `gen.chunkEmbeddings` Map while iterating — folding it into a pure result-returning API would force a `{kind:'reuse'|'embed'}` union and a dispatch reduce that hides the side effect. Leaving it duplicated is clearer than over-abstracting.

### Do not conflate concurrency axes
Fixed-size `Promise.all` batching (e.g. `BATCH_SIZE = 100` in `src/chunk-embedding-storage.ts`) bounds file descriptors, not worker count. It is a different axis and must not be folded into `mapWithConcurrency`. (If a batched site genuinely wants worker-count bounding instead, it may switch — but only when the axis actually matches.)

### History
Extracted from five near-identical inline worker pools: `src/storage.ts` (the only generic one, previously private), `src/tools/project-memory-summary.ts` `hydrateEntries`, `src/helpers/embed.ts` `embedMissingNotes` (migrated), plus two in `src/document-sync.ts` and one batched `Promise.all` in `src/chunk-embedding-storage.ts` (intentionally left duplicated per the rules above).

## Single source of truth for repeated sequences

When an exact operation sequence is duplicated verbatim across ≥3 call sites, extract one helper that owns the sequence. Example: `embedNote(storage, note, now)` in `src/helpers/embed.ts` owns the `embedTextForNote → embed → embeddingMetadata → writeEmbedding` sequence, replacing four identical copies in `remember`, `update`, `consolidate-helpers`, and `embedMissingNotes`.

### Rules
- Callers keep their own `attempt("scope:...", ...)` fail-soft wrapper and scope label; the helper is the inner body. This preserves per-site error scopes without parameterizing the helper.
- Do NOT extract if the sites diverge along their real axis of change. Prefer duplication over a parameterized wrapper that hides per-site differences or adds boolean flags. The bar: extraction must remove real duplication without increasing complexity or making the code harder to change along its axis of change.

### Counter-example from the same audit
The chunk-embedding sequence in `src/document-sync.ts` (`ChunkEmbeddingRecord` + `contentHash` + `ChunkEmbeddingStorage.write`) looks similar to the note-embedding sequence but has a genuinely different record shape and storage backend. It correctly stays separate — forcing it through `embedNote` would parameterize away the differences.
