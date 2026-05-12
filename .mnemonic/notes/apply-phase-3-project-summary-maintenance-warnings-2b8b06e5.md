---
title: 'Apply: Phase 3 project summary maintenance warnings'
tags:
  - workflow
  - apply
  - project-summary
  - diagnostics
  - maintenance-warnings
lifecycle: temporary
createdAt: '2026-05-12T21:07:34.336Z'
updatedAt: '2026-05-12T21:07:34.336Z'
role: context
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
# Apply: Phase 3 Project Summary Maintenance Warnings

Implements Phase 3 of `plan-advisory-memory-health-diagnostics-from-microsoft-memor-a0aa3e62`.

## Why Project Summary First

Phase 3 exposes metadata-only project health signals at session start. `project_memory_summary` already loads project notes and provides broad orientation, so it is the correct surface for cheap warnings such as stale temporary notes, superseded cleanup candidates, and weak orientation anchors.

`consolidate(dry-run)` remains the planned Phase 4 surface for heavier duplicate/interference analysis because it is the explicit maintenance-analysis tool and already performs duplicate/cluster work.

## What Changed

- Added `maintenanceWarnings?: ProjectMaintenanceWarning[]` to `ProjectSummaryResult`.
- Added structured warning types and schema:
  - `ProjectMaintenanceWarningCode`
  - `ProjectMaintenanceWarningSeverity`
  - `ProjectMaintenanceWarning`
  - `ProjectMaintenanceWarningSchema`
- Added Zod `.describe()` coverage for warning fields and nested `sampleNotes` fields.
- Added metadata-only warning generation in `project_memory_summary` using already-loaded notes and `computeDecayInfo`.
- Rendered matching compact text warnings under a `Maintenance:` section.

## Warning Codes

- `stale-temporary-notes`: temporary notes whose decay evidence suggests review or consolidation.
- `superseded-prune-candidates`: notes with explicit supersedes relationship whose decay evidence suggests pruning may be worth reviewing.
- `weak-orientation-anchors`: projects with enough notes but no strong anchor/summary/decision orientation candidate.

## Constraints Preserved

- No automatic forgetting, pruning, deletion, or lifecycle demotion.
- No read-path writes.
- No duplicate detection inside `project_memory_summary`.
- No embedding/similarity scan added to the summary path.
- Warnings are advisory and include explicit suggested actions.
- Structured output and text output are aligned.
- MCP tool description stayed compact; only the Returns line includes `maintenance warnings`.

## Review Fixes

Fresh TypeScript review initially found:

- Warning helper used only explicit `entry.note.role` instead of effective role metadata.
- Weak-anchor warning could be noisy for projects that have durable summary/decision orientation notes.
- Zod literals duplicated TypeScript warning-code types, and nested sample note fields lacked descriptions.

Fixes:

- Use `EffectiveNoteMetadata` role in `computeDecayInfo`.
- Suppress weak-anchor warning when a permanent alwaysLoad/summary/decision orientation candidate exists.
- Added shared warning-code/severity constants and nested field descriptions.
- Added tests for inferred-role maintenance warning behavior and weak-anchor noise suppression.

Final review found no blockers and recommended continue.

## Validation

- `npm run build` — pass
- `npm test -- tests/project-memory-summary.integration.test.ts tests/project-summary.unit.test.ts tests/provenance.unit.test.ts` — pass, 74 tests

## Follow-Up

Phase 4 can refine `consolidate(dry-run)` evidence for similarity/interference-specific maintenance guidance without duplicating heavier analysis in `project_memory_summary`.
