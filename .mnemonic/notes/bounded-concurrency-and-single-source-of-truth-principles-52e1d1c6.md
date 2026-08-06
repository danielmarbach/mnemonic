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
createdAt: '2026-08-06T04:41:54.769Z'
updatedAt: '2026-08-06T04:42:02.383Z'
role: reference
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: performance-principles-for-file-first-mcp-and-git-backed-wor-4e7d3bc8
    type: derives-from
  - id: implementation-principles-for-mnemonic-mcp-2e178bba
    type: related-to
memoryVersion: 1
---
Two reusable-component principles extracted from a duplication audit of the mnemonic TypeScript codebase, now enforced via shared primitives. Captured through the mnemonic remember tool — an earlier hand-written .mnemonic/notes/ file for this same principle was illegitimate and removed; notes must be created via MCP, never by writing .mnemonic/ files directly.

Bounded concurrency — one shared primitive: mapWithConcurrency in src/concurrency.ts. Use it to map independent async work over a collection without unbounded concurrency, including bulk file reads, where the concurrency parameter IS the file-descriptor bound (N in-flight fs.readFile calls = at most N open descriptors). It preserves input order in the result by construction.

Rules: return a value per item and reduce post-loop; express a skip as a null sentinel filtered after, not a continue inside the loop; do NOT mutate shared arrays or Maps from inside the per-item function (that reintroduces nondeterministic completion order); keep each call site's own concurrency constant (the bound is domain-specific).

Keep a hand-rolled or serial loop only when the per-item body has an intrinsic side effect on a shared structure that cannot be returned as a value without a tagged-union dispatch that obscures the real axis of change. Examples: embedGenerationChunks in src/document-sync.ts mutates a shared gen.chunkEmbeddings Map while iterating; reconcile in src/chunk-embedding-storage.ts unlinks files mid-loop (serial, so no FD pressure).

"FD bounding" is NOT a separate axis from worker-count bounding: for file reads they coincide. Fixed-size Promise.all batching is the SAME bound with sync barriers between batches (worse throughput for the same FD cap) — prefer mapWithConcurrency. An earlier version of this principle wrongly claimed batching was "a different axis" and "must not be folded"; that was wrong, and chunk-embedding-storage.ts list() has since been migrated from BATCH_SIZE=100 batching to mapWithConcurrency(jsonFiles, 100, ...).

Migrated sites: storage.ts listNotes/listNotesMetadata/listEmbeddings, project-memory-summary.ts hydrateEntries, helpers/embed.ts embedMissingNotes, chunk-embedding-storage.ts list. Left hand-rolled/serial: document-sync.ts embedGenerationChunks (two pools, shared-Map side effect), chunk-embedding-storage.ts reconcile (serial unlinks).

Single source of truth for repeated sequences: when an exact operation sequence is duplicated verbatim across three or more call sites, extract one helper that owns it. Example: embedNote(storage, note, now) in src/helpers/embed.ts owns the embedTextForNote then embed then embeddingMetadata then writeEmbedding sequence, replacing four copies in remember, update, consolidate-helpers, and embedMissingNotes. Callers keep their own attempt("scope:...") fail-soft wrapper and scope label; the helper is the inner body. Do NOT extract if the sites diverge along their real axis of change — prefer duplication over a parameterized wrapper that hides per-site differences (e.g. the chunk-embedding sequence in document-sync.ts has a different record shape and backend and correctly stays separate).

The durable, always-on form of these rules lives in AGENT.md (TypeScript patterns: "Bounded concurrency" and "Single source of truth for repeated sequences"); this note is the recallable rationale and history.
