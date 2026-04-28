---
title: 'Reference: RPIR evidence-enrichment delivery pattern for mnemonic'
tags:
  - reference
  - workflow
  - rpir
  - evidence
  - mnemonic
lifecycle: permanent
createdAt: '2026-04-26T19:01:36.389Z'
updatedAt: '2026-04-26T19:01:43.790Z'
role: reference
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: decision-expose-trust-evidence-at-decision-points-via-opt-in-244d8317
    type: derives-from
  - id: summary-evidence-enrichment-implementation-across-recall-and-10b7ba37
    type: follows
memoryVersion: 1
---
# Reference: RPIR evidence-enrichment delivery pattern for mnemonic

Use this pattern when adding explainability/trust features to mnemonic tools without introducing orchestration behavior.

## Pattern

- Keep workflow/runtime orchestration outside mnemonic; add capability-layer enrichment at existing decision points.
- Make enrichment opt-in by default (`evidence` flags or mode-like toggles) to preserve token efficiency.
- Serialize stable abstractions in tool output, not raw ranking internals.
- Keep warning/risk heuristics deterministic and testable in helper modules.
- Enrich both structured output and compact text output so humans and agents can consume the same decision signals.

## RPIR closeout checklist

- Create permanent decision note for design choice.
- Create permanent summary note with verification evidence and shipped commit.
- Link outcomes to request/plan/review with sparse `derives-from` and `follows` edges.
- Keep temporary apply/review/request notes as scaffolding unless explicit cleanup is requested.
