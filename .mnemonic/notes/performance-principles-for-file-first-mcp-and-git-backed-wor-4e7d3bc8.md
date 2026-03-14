---
title: Performance principles for file-first MCP and git-backed workflows
tags:
  - performance
  - io
  - git
  - design
  - principles
lifecycle: permanent
createdAt: '2026-03-14T22:14:46.759Z'
updatedAt: '2026-03-14T22:14:51.593Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mnemonic-key-design-decisions-3f2a6273
    type: related-to
memoryVersion: 1
---
Durable performance lessons for mnemonic's file-first MCP and git-backed architecture.

Core principles:

- Favor low-risk optimizations that preserve behavior and safety over broad rewrites.
- Optimize hot paths by reusing already-available data in-memory before adding new I/O.
- Keep git subprocess usage minimal, especially on successful mutation paths.
- Prefer bounded parallel file reads for independent files while preserving output stability and ordering contracts.
- Keep retry/recovery metadata construction constant-time from existing context.

Applied examples:

- Added per-request note caching in recall to avoid duplicate note reads.
- Reused loaded embeddings during consolidate analysis instead of re-reading per comparison.
- Parallelized `Storage.listNotes` and `Storage.listEmbeddings` file reads with stable behavior.
- Reduced duplicate git-root resolution in vault search-order calculation.
- For commit-failure retry contracts, used existing attempted commit context rather than extra filesystem or git lookups.

Design guardrails:

- Avoid full-vault scans in mutation hot paths.
- Avoid adding extra git calls on successful commit/push flows.
- Keep correctness and recoverability explicit in structured outputs.
