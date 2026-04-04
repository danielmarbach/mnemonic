---
title: 'Phase 1 design: hybrid recall over existing projections'
tags:
  - design
  - recall
  - projections
  - token-efficiency
lifecycle: permanent
createdAt: '2026-04-04T11:51:15.298Z'
updatedAt: '2026-04-04T11:51:46.379Z'
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: phase-1-implementation-plan-bounded-fail-soft-hybrid-recall-a416e489
    type: explains
  - id: mnemonic-key-design-decisions-3f2a6273
    type: example-of
memoryVersion: 1
---
Hybrid recall should improve mnemonic recall quality by combining semantic retrieval with lexical reranking and lexical rescue over existing projection data, while preserving mnemonic's core simplicity constraints.

Adjusted design principles for this phase:

- semantic retrieval remains primary; lexical logic only reranks or rescues within a bounded candidate set
- hybrid logic operates over existing compact projections rather than raw note bodies
- no new synced persistence layer, database, daemon, or hidden runtime state is introduced
- projections remain derived, local-only, and gitignored; the feature must not create new committed artifacts
- failures in lexical or projection-dependent logic must fail soft to the current semantic-first behavior
- output must stay token-efficient and compact rather than dumping raw note bodies or verbose diagnostics
- recall quality may improve, but default operational simplicity and bounded latency remain mandatory

Why this fits mnemonic:

- it reinforces the existing file-first, projection-based, embedding-driven model
- it adds precision and weak-query recovery without changing the storage model
- it preserves the principle that post-processing layers are additive, bounded, and reversible if they underperform

Non-goals:

- replacing semantic search with lexical search
- repo-wide indexing beyond existing projections
- introducing any new persistent or remotely synced retrieval infrastructure
