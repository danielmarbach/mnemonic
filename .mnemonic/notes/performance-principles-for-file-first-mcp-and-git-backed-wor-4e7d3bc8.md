---
title: Performance principles and completed optimizations
tags:
  - performance
  - io
  - git
  - design
  - principles
  - completed
lifecycle: permanent
createdAt: '2026-03-14T22:14:46.759Z'
updatedAt: '2026-04-16T19:34:48.386Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mnemonic-key-design-decisions-3f2a6273
    type: related-to
  - id: active-session-project-cache-single-in-memory-vault-cache-pe-7463f124
    type: related-to
memoryVersion: 1
---
## Durable Performance Principles

Core principles:

- Favor low-risk optimizations that preserve behavior and safety over broad rewrites
- Optimize hot paths by reusing already-available data in-memory before adding new I/O
- Keep git subprocess usage minimal, especially on successful mutation paths
- Prefer bounded parallel file reads for independent files while preserving output stability and ordering contracts
- Keep retry/recovery metadata construction constant-time from existing context

## Completed Optimizations

Low-hanging performance improvements (March 2024):

### 1. Recall per-request note cache

- Added caching to avoid duplicate note reads during recall operations
- Commit: `perf: cache recall note reads per request`
- Validation: `npm test -- tests/recall.test.ts`

### 2. Consolidate analysis embedding reuse  

- Reuse loaded embeddings during consolidate analysis instead of re-reading per comparison
- Commit: `perf: reuse embeddings in consolidate analysis`
- Validation: `npm test -- tests/consolidate.test.ts`

### 3. Storage.listNotes parallel file reads

- Parallelized file reads with preserved order
- Commit: `perf: parallelize Storage.listNotes reads`
- Validation: `npm test -- tests/storage.test.ts tests/recall.test.ts tests/project-introspection.test.ts`

### 4. Storage.listEmbeddings parallel file reads

- Parallelized embeddings file reads
- Commit: `perf: parallelize Storage.listEmbeddings reads`
- Validation: `npm test -- tests/embeddings.test.ts tests/recall.test.ts tests/consolidate.test.ts`

### 5. VaultManager.searchOrder duplicate resolution

- Avoid duplicate git-root lookup in searchOrder
- Commit: `perf: avoid duplicate git-root lookup in searchOrder`
- Validation: `npm test -- tests/vault.test.ts tests/project.test.ts tests/project-introspection.test.ts`

### 6. Active session project cache (Phase 5)

- Module-level singleton in `src/cache.ts` caches `listNotes()` + `listEmbeddings()` together per vault; `recall`, `get`, and `project_memory_summary` all read from the same warm cache within a session
- Invalidated on every write-path tool; fail-soft returns `undefined` so callers fall back cleanly
- Instrumented with `[cache:hit/miss/build/invalidate/fallback]` events and per-tool timing via `performance.now()`
- Validation: `npm test -- tests/cache.unit.test.ts tests/project-memory-summary.integration.test.ts`

## Design Guardrails

- Avoid full-vault scans in mutation hot paths
- Avoid adding extra git calls on successful commit/push flows
- Keep correctness and recoverability explicit in structured outputs

## Future Performance Work

When adding new features, apply these principles:

1. Measure before optimizing
2. Prefer in-memory reuse over new I/O
3. Keep hot paths lean
4. Maintain test coverage for performance-critical paths
