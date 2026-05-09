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
updatedAt: '2026-05-09T16:50:22.436Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: review-signal-strength-confidence-scoring-implementation-9710c108
    type: derives-from
memoryVersion: 1
---
## Apply: Enriched Confidence Scoring with Signal-Strength Composite

Implements plan: `plan-enriched-confidence-scoring-with-signal-strength-compos-83ac7a58`

### Checklist

- [x] Step 1: computeSignalStrength in src/provenance.ts
- [x] Step 2: signalStrength in RecallResult interface + Zod schema
- [x] Step 3: Update computeConfidence to use signalStrength tiers
- [x] Step 4: Populate signalStrength in recall tool handler
- [x] Step 5: Unit tests in tests/provenance.unit.test.ts
- [x] Step 6: Integration tests in tests/recall-pipeline.integration.test.ts
- [ ] Step 7: Dogfooding pack for signal validation
- [x] Verification: npx tsc --noEmit
- [x] Verification: npm test (51 files, 870 tests, 0 failures)

### Derivations from plan

All signal weights from plan Step 1. Confidence thresholds from plan Step 3. No new I/O, all signals from frontmatter + session cache.

### Changes

**src/provenance.ts**: Added `computeSignalStrength()` — composite from role (0.05-0.15), centrality (0-0.15 capped log), lifecycle (0 or 0.10), recency (0-0.10 linear decay over 90d). Updated `computeConfidence` to accept optional `signalStrength` parameter; when present, thresholds at 0.35 (high) and 0.15 (medium). Fallback legacy path preserved with exact original constants.

**src/structured-content.ts**: Added `signalStrength?: number` to RecallResult interface and Zod schema with `.describe()`.

**src/tools/recall.ts**: Import `computeSignalStrength`. Call it alongside existing confidence computation. Pass result to `computeConfidence`. Include `signalStrength` in structuredResults. Tool description updated with signalStrength bullet.

**tests/provenance.unit.test.ts**: 11 new tests covering computeSignalStrength (edge cases: zero relations, stale notes, role weights, lifecycle contribution, centrality cap) and computeConfidence with signalStrength (high/medium/low thresholds, undefined fallback).

**tests/recall-pipeline.integration.test.ts**: New test verifying signalStrength present in recall results for project context, values in valid range, summary note scores higher than context note.
