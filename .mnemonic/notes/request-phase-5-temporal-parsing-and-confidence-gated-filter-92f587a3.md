---
title: 'Request: Phase 5 temporal parsing and confidence-gated filtering design'
tags:
  - workflow
  - request
  - phase5
  - recall
  - temporal
lifecycle: temporary
createdAt: '2026-04-25T11:40:18.503Z'
updatedAt: '2026-04-25T11:40:38.573Z'
role: context
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: research-phase-5-temporal-parsing-options-and-filtering-safe-cd641999
    type: derives-from
  - id: plan-phase-5-temporal-parsing-with-confidence-gated-filterin-0f45f3cd
    type: derives-from
memoryVersion: 1
---
# Request: Phase 5 temporal parsing and confidence-gated filtering design

Define and implement Phase 5 of the hindsight-derived recall plan.

## Goal

Improve temporal-query handling beyond Phase 4 by adding richer temporal intent parsing and evaluating whether strict filtering should be applied only when temporal intent confidence is high.

## Scope

- Build on existing Phase 4 temporal boost behavior.
- Keep fail-soft and additive-first behavior as default.
- Treat strict filtering as optional and confidence-gated.

## Success criteria

- Better ranking precision on temporal queries without regressing non-temporal recall.
- No architecture drift (file-first, no persistent indexing layer, no daemons/databases).
- Clear decision on when filtering is safe vs unsafe.
