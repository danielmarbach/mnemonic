---
title: Phase 5 temporal parsing and confidence-gated filtering (completed)
tags:
  - hindsight
  - recall
  - phase-5
  - completed
lifecycle: permanent
createdAt: '2026-04-25T21:43:43.820Z'
updatedAt: '2026-04-25T21:43:43.820Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: plan-mnemonic-recall-improvements-from-hindsight-research-5b059160
    type: follows
  - id: summary-performance-principles-compliance-audit-for-recall-p-b482b38b
    type: derives-from
memoryVersion: 1
---
Phase 5 implemented temporal parsing with confidence-gated filtering.

- Explicit relative-window parsing for numeric windows.
- Temporal confidence model (`high`/`medium`/low`).
- Strict filtering only for high-confidence explicit windows.
- Additive boost-only behavior for medium/low confidence hints.
- Same policy applied in both semantic recall and lexical rescue paths.
- Temporal hint detection reordered by specificity (longer patterns first) to fix first-match-wins.
- Added `in\s+the\s+past` temporal regex pattern.

Decision: `decision-phase-5-applies-strict-temporal-filtering-only-for--63146f96`
Implementation: temporal parser + gating helpers in `src/recall.ts`; gated application in `src/index.ts`.
