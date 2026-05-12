---
title: 'Apply: Phase 4 consolidation evidence refinement'
tags:
  - workflow
  - apply
  - consolidation
  - evidence
  - classification
lifecycle: temporary
createdAt: '2026-05-12T21:13:59.496Z'
updatedAt: '2026-05-12T21:14:03.056Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: plan-advisory-memory-health-diagnostics-from-microsoft-memor-a0aa3e62
    type: follows
memoryVersion: 1
---
# Apply: Phase 4 Consolidation Evidence Refinement

Implements Phase 4 of `plan-advisory-memory-health-diagnostics-from-microsoft-memor-a0aa3e62`.

## Why Consolidate Evidence Refinement

Current dogfood showed `consolidate(dry-run)` already finds high-similarity pairs and large connected clusters. The gap is interpretation. Evidence warnings should help agents distinguish expected workflow lineage from problematic duplication, and avoid merging research notes that contain unique source evidence.

## What Changed

- Added `ConsolidateClassification` types: `lineage`, `duplicate-pressure`, `supersession-pressure`, `unique-evidence-risk`
- Added `classifyConsolidationPair` and `classifyConsolidationWarning` helpers in `src/consolidate.ts`
- Added classification to `ConsolidateNoteMergeEvidence` interface and Zod schema
- Enhanced `buildConsolidateNoteEvidence` to include classification alongside existing warnings
- Enhanced text output in `detectDuplicates`, `suggestMerges`, and `executeMerge` to show classification
- Added `ConsolidateResult.maintenanceWarnings` for project-level consolidate warnings (stale temporary and superseded prune candidates)
- Added unit tests for classification edge cases
- Added integration test for dry-run classification output

## Classification Logic

- `lineage`: plan/apply/review notes in same similarity pair with derives-from or follows relationship — expected overlap, not duplication
- `duplicate-pressure`: same role/lifecycle, high similarity, no clear derives-from/follows relationship
- `unique-evidence-risk`: research notes without follows/derives-from links — merging risks losing unique source evidence
- `supersession-pressure`: older notes with explicit supersedes relationship and high staleness

## Constraints Preserved

- No auto-merge.
- Preserve current idempotent execute-merge behavior.
- Keep merge risk conservative.
- Classification is advisory — agents still make the final decision.
- Structured output and text output aligned.
- No new I/O on consolidate paths — classification derives from already-loaded note metadata and embeddings.

## Validation

- `npm run build` — pass
- `npm test` — pass
- Existing consolidate tests still pass
- Dogfood on current vault confirms warnings are useful and not noisy
