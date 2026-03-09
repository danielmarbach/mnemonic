---
title: Recall heuristic instead of full dynamic context loading
tags:
  - recall
  - architecture
  - decision
  - scaling
lifecycle: permanent
createdAt: '2026-03-08T08:36:41.517Z'
updatedAt: '2026-03-08T08:36:41.517Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Decision on the dynamic project context loading plan.

- Do not implement the full runtime project-context loading/unloading architecture yet.
- Implement a lightweight recall heuristic instead: when `scope` is `all`, prefer current-project matches first and widen to global matches only if needed to fill the requested limit.
- Rationale: this captures most of the practical benefit now without introducing cache lifecycle, invalidation, active-project state, or long-lived runtime complexity.
- Keep the broader dynamic-loading plan as a future scaling option, to be revisited only if recall latency or cross-project noise becomes a demonstrated problem.
