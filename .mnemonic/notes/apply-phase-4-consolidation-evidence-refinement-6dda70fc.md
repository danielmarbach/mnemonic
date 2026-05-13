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
updatedAt: '2026-05-12T21:53:27.295Z'
role: context
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

## What Changed

- Added `ConsolidateClassification` type: `lineage`, `duplicate-pressure`, `unique-evidence-risk`, `supersession-pressure`
- Added `classifyConsolidationPair` and `classifyConsolidationNote` helpers in `src/consolidate.ts`
- Added `classification` field to `ConsolidateNoteMergeEvidence` with Zod `.describe()`
- Added `ConsolidateMaintenanceWarning` type reusing project-maintenance warning pattern
- Added `maintenanceWarnings` to `ConsolidateResult` for project-level warnings
- Enhanced text output in `detectDuplicates`, `suggestMerges`, `executeMerge` for classification
- Added maintenance warnings text output in `dryRunAll`
- Added 12 unit tests for classification logic
- Updated consolidate tool description

## Validation

- build pass, 24 consolidate unit tests pass, 50 integration tests pass
