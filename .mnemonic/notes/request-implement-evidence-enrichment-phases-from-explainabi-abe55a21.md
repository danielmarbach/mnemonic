---
title: 'Request: implement evidence enrichment phases from explainability plan'
tags:
  - workflow
  - request
  - explain
  - consolidate
  - recall
  - evidence
lifecycle: temporary
createdAt: '2026-04-26T17:34:05.404Z'
updatedAt: '2026-04-26T19:01:27.561Z'
role: context
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: plan-enrich-decision-points-with-retrieval-rationale-and-tru-0dd24e70
    type: derives-from
  - id: decision-expose-trust-evidence-at-decision-points-via-opt-in-244d8317
    type: derives-from
  - id: summary-evidence-enrichment-implementation-across-recall-and-10b7ba37
    type: derives-from
memoryVersion: 1
---
# Request: implement evidence enrichment phases from explainability plan

Implement the active plan that enriches recall and consolidate decision points with compact evidence/trust signals.

## Scope

- Phase 1: add opt-in recall evidence payload and text rendering
- Phase 2: enrich consolidate decision output with merge evidence and warnings
- Phase 2.5: update workflow hint and tool descriptions for evidence discoverability
- Validate with targeted tests and document review evidence

## Constraints

- Keep evidence compact and token-efficient
- Use stable abstractions instead of exposing raw internal scores
- Maintain backwards compatibility by keeping recall evidence opt-in
