---
title: 'Review: consolidation evidence discriminative power fix'
tags:
  - evidence
  - consolidate
  - review
  - discriminative-power
lifecycle: temporary
createdAt: '2026-04-28T12:07:26.133Z'
updatedAt: '2026-04-28T13:10:11.466Z'
role: review
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: plan-fix-consolidation-evidence-discriminative-power-2c34bb7b
    type: derives-from
  - id: dogfood-findings-consolidation-evidence-metadata-alone-insuf-7278ec64
    type: follows
memoryVersion: 1
---
# Review: consolidation evidence discriminative power fix

## Outcome: Continue — implementation complete and verified

## Changes delivered

### Problem 1 fixed: mergeRisk discriminates

- `deriveMergeRisk` now uses critical vs non-critical classification
- Critical warnings (supersedes chain, stale summary risk) → "high"
- Non-critical (temporary research, lifecycle mismatch) → "medium" (single) or "high" (2+)
- No more 2+ warnings → auto-"high" collapse

### Problem 2 fixed: per-note risk is per-note

- `buildConsolidateNoteEvidence` now calls `buildNoteWarnings` internally per note
- No longer receives group-level warnings as input
- Each note's `mergeRisk` reflects that note's own warnings only

### Problem 3 fixed: warnings are note-specific

- `buildNoteWarnings(note, allNotes, targetNote?)` returns warnings for a single note
- Each warning identifies the specific trigger (which lifecycle mismatches, how many sources are newer, etc.)
- `buildGroupWarnings` aggregates with note title prefixes for actionability

### New: `aggregateMergeRisk` helper

- Group risk = max per-note risk instead of count-based threshold
- Used in detectDuplicates, suggestMerges, executeMerge callers

### `majorityLifecycle` correctness

- Returns `undefined` when no strict majority exists (prevents spurious lifecycle mismatch warnings in ties)

## Verification evidence

- Command: `rtk tsc --noEmit`
- Result: pass
- Details: TypeScript check completed without errors

- Command: `rtk npm run build:fast`
- Result: pass
- Details: rebuilt build/index.js for MCP integration

- Command: `rtk vitest tests/consolidate.unit.test.ts`
- Result: pass
- Details: PASS (12), FAIL (0)

- Command: `rtk vitest` (full suite)
- Result: pass
- Details: PASS (836), FAIL (0)
