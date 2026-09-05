---
title: Recall heuristic instead of full dynamic context loading
tags:
  - recall
  - architecture
  - decision
  - scaling
lifecycle: permanent
createdAt: '2026-03-08T08:36:41.517Z'
updatedAt: '2026-09-05T21:31:37.892Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: dynamic-project-context-loading-plan-9f2ed29c
    type: related-to
memoryVersion: 1
---
The project-first selection heuristic in this historical decision is superseded by `canonical-design-bounded-rrf-hybrid-recall-172a96ab`. Current recall uses score ordering with bounded project priors, not project-first slot filling. The user approved this reconciliation during the measured performance and code-quality pass; it does not authorize a ranking behavior change.

## Historical decision and rationale

- Defer the full runtime project-context loading/unloading architecture.
- Originally, when `scope` was `all`, prefer current-project matches first and widen to global matches only to fill the requested limit.
- The original rationale was to obtain practical project relevance without introducing long-lived runtime complexity.
- The bounded RRF alignment later removed this hard project-first selector. Its delivery record is `apply-bounded-rrf-hybrid-recall-alignment-consolidated-2ece69b3`.

## Continuing constraint

Do not introduce the broader dynamic-loading architecture as a performance shortcut. Any revisit requires measured evidence and explicit approval; the canonical bounded RRF design and current session-cache decisions govern implementation.
