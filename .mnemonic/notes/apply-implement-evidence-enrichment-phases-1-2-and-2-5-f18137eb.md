---
title: 'Apply: implement evidence enrichment phases 1, 2, and 2.5'
tags:
  - apply
  - workflow
  - recall
  - consolidate
  - evidence
lifecycle: temporary
createdAt: '2026-04-26T17:34:15.560Z'
updatedAt: '2026-04-26T18:46:33.743Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: plan-enrich-decision-points-with-retrieval-rationale-and-tru-0dd24e70
    type: follows
memoryVersion: 1
---
# Apply: implement evidence enrichment phases 1, 2, and 2.5

## Checklist

- [ ] Phase 1: wire `evidence` option into `recall` params and output shaping
- [ ] Phase 1: add compact `retrievalEvidence` for each recall result
- [ ] Phase 1: add/adjust tests for recall evidence behavior (default off + opt-in on)
- [ ] Phase 2: enrich consolidate strategy outputs with `mergeEvidence`
- [ ] Phase 2: add merge warnings/risk classification in suggest-merges output
- [ ] Phase 2: add/adjust tests for consolidate evidence output
- [ ] Phase 2.5: update workflow hint and MCP tool descriptions for evidence discoverability
- [ ] Verification: run targeted test suite and capture command evidence

## Notes

Implement directly from the active plan `plan-enrich-decision-points-with-retrieval-rationale-and-tru-0dd24e70` and keep output compact by default.

## Implementation findings (important)

- Recall already computes most ranking/provenance signals; evidence can be serialized at output boundary without changing ranking pipeline.
- `detect-duplicates` and `suggest-merges` currently build text-first output and discard structured pair/suggestion details; explicit schema fields are needed for machine-consumable evidence.
- Consolidation warning/risk logic belongs in `src/consolidate.ts` for deterministic unit testing and reuse across strategies.
- `dry-run` reuses detect/suggest output, so evidence must be threaded through those functions to keep one behavior surface.
- `mnemonic-workflow-hint` should frame evidence as optional confidence aid, not a mandatory pre-step.
