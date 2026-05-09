---
title: 'Apply: Enriched confidence scoring with signal-strength composite'
tags:
  - workflow
  - apply
  - confidence
  - ranking
  - semvec
lifecycle: temporary
createdAt: '2026-05-09T15:58:33.977Z'
updatedAt: '2026-05-09T15:58:33.977Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
## Apply: Enriched Confidence Scoring with Signal-Strength Composite

Implements plan: `plan-enriched-confidence-scoring-with-signal-strength-compos-83ac7a58`

### Checklist

- [ ] Step 1: computeSignalStrength in src/provenance.ts
- [ ] Step 2: signalStrength in RecallResult interface + Zod schema
- [ ] Step 3: Update computeConfidence to use signalStrength tiers
- [ ] Step 4: Populate signalStrength in recall tool handler
- [ ] Step 5: Unit tests in tests/provenance.unit.test.ts
- [ ] Step 6: Integration tests in tests/recall-pipeline.integration.test.ts
- [ ] Step 7: Dogfooding pack for signal validation
- [ ] Verification: npx tsc --noEmit
- [ ] Verification: npm test
- [ ] Verification: Dogfooding Pack A (no regression)

### Derivations from plan

All signal weights from plan Step 1. Confidence thresholds from plan Step 3. No new I/O, all signals from frontmatter + session cache.
