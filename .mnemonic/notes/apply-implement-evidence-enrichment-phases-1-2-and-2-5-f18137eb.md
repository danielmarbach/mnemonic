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
updatedAt: '2026-04-26T17:34:23.250Z'
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
