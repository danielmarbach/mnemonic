---
title: 'Phase 1 implementation plan: bounded fail-soft hybrid recall'
tags:
  - plan
  - recall
  - projections
  - token-efficiency
lifecycle: temporary
createdAt: '2026-04-04T11:51:15.300Z'
updatedAt: '2026-04-04T11:51:25.510Z'
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: phase-1-design-hybrid-recall-over-existing-projections-4dc7dbb9
    type: explains
memoryVersion: 1
---
Implement hybrid recall over existing projections in a way that preserves semantic-first behavior, token efficiency, and mnemonic's low-infrastructure design.

Adjusted implementation plan:

1. Baseline current recall quality, token usage, and latency so regressions are visible.
2. Reuse the existing projection surface only; do not introduce a new stored index or persistence path.
3. Add normalization utilities for lightweight lexical matching over projection text.
4. Score lexical overlap only for a bounded semantic candidate set.
5. Apply hybrid reranking without replacing the semantic-first entry path.
6. Add a confidence gate so lexical rescue runs only when the semantic result set is weak.
7. Rescue from projection data only, with strict bounds on candidate count and work performed.
8. Keep output compact and structured; do not expand payload size or dump note bodies.
9. Test exact-match, typo, and weak-semantic queries plus fail-soft fallback behavior.
10. Validate that latency and token usage remain within the current operational envelope.

Definition of done:

- semantic-first behavior preserved
- better exact-match and weak-query recall where lexical evidence is strong
- no new storage layer or synced state
- no token growth in default output
- lexical/projection failures degrade gracefully to existing behavior
