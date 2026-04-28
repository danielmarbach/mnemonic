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
updatedAt: '2026-04-26T19:20:29.641Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: plan-enrich-decision-points-with-retrieval-rationale-and-tru-0dd24e70
    type: follows
  - id: review-evidence-enrichment-phases-1-2-and-2-5-verification-5501cdf6
    type: derives-from
  - id: review-evidence-enrichment-implementation-vs-plan-specificat-139a7ce2
    type: derives-from
memoryVersion: 1
---
# Apply: implement evidence enrichment phases 1, 2, and 2.5

## Checklist

- [x] Phase 1: wire `evidence` option into `recall` params and output shaping
- [x] Phase 1: add compact `retrievalEvidence` for each recall result
- [x] Phase 1: add/adjust tests for recall evidence behavior (default off + opt-in on)
- [x] Phase 2: enrich consolidate strategy outputs with `mergeEvidence`
- [x] Phase 2: add merge warnings/risk classification in suggest-merges output
- [x] Phase 2: add/adjust tests for consolidate evidence output
- [x] Phase 2.5: update workflow hint and MCP tool descriptions for evidence discoverability
- [x] Verification: run targeted test suite and capture command evidence

## Notes

Implement directly from the active plan `plan-enrich-decision-points-with-retrieval-rationale-and-tru-0dd24e70` and keep output compact by default.

## Implementation findings (important)

- Recall already computes most ranking/provenance signals; evidence can be serialized at output boundary without changing ranking pipeline.
- `detect-duplicates` and `suggest-merges` currently build text-first output and discard structured pair/suggestion details; explicit schema fields are needed for machine-consumable evidence.
- Consolidation warning/risk logic belongs in `src/consolidate.ts` for deterministic unit testing and reuse across strategies.
- `dry-run` reuses detect/suggest output, so evidence must be threaded through those functions to keep one behavior surface.
- `mnemonic-workflow-hint` should frame evidence as optional confidence aid, not a mandatory pre-step.

## Verification evidence

- Command: `rtk npm run typecheck`
- Result: pass
- Details: TypeScript check completed without errors

- Command: `rtk npm run build:fast`
- Result: pass
- Details: refreshed `build/index.js` for MCP integration tests

- Command: `rtk vitest tests/consolidate.unit.test.ts tests/recall-embeddings.integration.test.ts tests/sync-migrations.integration.test.ts tests/tool-descriptions.integration.test.ts`
- Result: pass
- Details: PASS (54), FAIL (0)
