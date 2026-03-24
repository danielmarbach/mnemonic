---
title: Execute-merge idempotency via pre-flight duplicate detection
tags:
  - consolidate
  - idempotency
  - future
  - design
  - implementation
  - completed
lifecycle: permanent
createdAt: '2026-03-10T20:55:24.666Z'
updatedAt: '2026-03-24T10:54:19.723Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: consolidate-tool-design-execute-merge-behavior-idempotency-a-0911e2cd
    type: supersedes
memoryVersion: 1
---
Decision: make `consolidate` `execute-merge` idempotent by reusing an existing target note when retries repeat the same merge.

Why this approach:
- Server-side duplicate detection is reliable for humans, LLMs, and thin MCP clients even when they lose retry state.
- It preserves the existing caller contract and note ID generation model.
- It keeps note identity decoupled from the exact merge input set.
- A persistent cache or operation log would add extra invalidation and consistency complexity for little value at mnemonic's current scale.
- Caller-supplied target IDs remain a possible future enhancement for advanced clients, but they are not reliable enough as the baseline guarantee for LLM-driven retries.

Implementation details:
- Before creating a new target, `executeMerge()` intersects the `supersedes` targets referenced by all source notes.
- It reuses a candidate only when the title matches exactly and the candidate ID shares the target title slug prefix.
- On reuse, the existing target note is updated in place, `createdAt` is preserved, source relationships remain deduplicated, and the result text makes the idempotent reuse explicit.
- Integration coverage verifies repeated `execute-merge` calls produce one target note and update the existing consolidated content instead of creating duplicates.
