---
title: Performance principles for file-first MCP and git-backed workflows
tags:
  - performance
  - architecture
  - design-decisions
  - io
  - git
lifecycle: permanent
createdAt: '2026-03-14T19:50:49.199Z'
updatedAt: '2026-03-14T19:50:49.199Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
General performance lessons for mnemonic (file-first MCP + git-backed behavior), linked to current architectural constraints:

1) Eliminate duplicate work before adding complexity.

- Practical rule: cache note/embedding reads within a single tool call when the same id is touched in scoring + formatting + structured output phases.
- Architectural link: this preserves the existing file-first model (`Storage` as source of truth) and avoids introducing long-lived global caches or invalidation complexity.

1) Prefer local, request-scoped caching over global caching.

- Practical rule: keep caches inside the request handler so correctness remains tied to current disk state and no cross-request staleness policy is needed.
- Architectural link: aligns with on-demand MCP stdio runtime and keeps behavior inspectable and deterministic.

1) Safe concurrency is best used for independent reads, not mutation sequencing.

- Practical rule: parallelize independent `readNote`/`readEmbedding` batches (e.g., `Promise.all` in list paths), but keep write/commit/push ordering unchanged.
- Architectural link: respects git-as-product-behavior, atomic migration guarantees, and protected-branch policy semantics.

1) Reduce subprocess churn in hot read paths.

- Practical rule: avoid resolving git root multiple times in one flow; resolve once and reuse.
- Architectural link: keeps project-aware routing but lowers overhead from repeated git subprocess calls.

1) Preserve observable behavior while optimizing internals.

- Practical rule: keep ordering, filtering semantics, and error handling unchanged; treat performance changes as internal refactors with stable outputs.
- Architectural link: supports the project’s stability-first posture and test-driven migration/tool contracts.

1) Benchmark where wall-clock is actually dominated.

- Practical rule: focus first on repeated file parse/read loops and nested pairwise scans; micro-optimizations are secondary.
- Architectural link: consistent with current architecture note that prioritizes simple correctness over aggressive runtime optimization.

Applied examples from this pass:

- request-scoped note caching in `recall`
- one-time embedding preload for consolidation analysis loops
- parallel reads in `Storage.listNotes` and `Storage.listEmbeddings`
- single git-root resolution in `VaultManager.searchOrder`

Use this note as the default checklist before future performance changes in `src/index.ts`, `src/storage.ts`, `src/vault.ts`, and `src/git.ts`.
