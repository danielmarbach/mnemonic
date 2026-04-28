---
title: 'Plan: fix consolidation evidence discriminative power'
tags:
  - evidence
  - consolidate
  - plan
  - discriminative-power
lifecycle: temporary
createdAt: '2026-04-28T11:51:19.221Z'
updatedAt: '2026-04-28T11:51:19.221Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
# Plan: fix consolidation evidence discriminative power

## Problem summary

Three interrelated issues make consolidation evidence useless for merge decisions:

1. `deriveMergeRisk`: 2+ warnings → "high" — all non-trivial groups collapse to "high" (97/97 in dogfood)
2. `buildConsolidateNoteEvidence`: receives group-level warnings → every note gets the same risk
3. `buildMergeWarnings`: checks group properties → warnings are too coarse for 5+ note groups

## Design: per-note warnings, calibrated risk

### Principle: warnings must be note-specific and risk must reflect per-note exposure

Every warning should name the specific note it applies to. Risk should be derived from the warnings that apply to *that* note, not to the entire group.

### Change 1: `buildMergeWarnings` → `buildNoteWarnings`

Replace group-level `buildMergeWarnings(notes, targetNote)` with per-note `buildNoteWarnings(note, notes, targetNote?)` that returns warnings specific to a single note relative to its group.

Per-note heuristics:

- **temporary research**: only on notes where `lifecycle === "temporary" && role === "research"` — e.g. `"source is temporary research"`
- **supersedes chain**: only on notes that have `relatedTo` with type `supersedes` — e.g. `"note supersedes 1 other"`
- **stale target risk**: only on the target note when a newer source exists — e.g. `"target is older than 1 source"`
- **lifecycle mismatch**: only on notes whose lifecycle differs from the majority lifecycle in the group — e.g. `"lifecycle (temporary) differs from group majority (permanent)"`

Each warning string includes the specific trigger (count, which lifecycle, etc.) for actionability.

Retain the ability to compute group-level warnings for backward compat (aggregate per-note warnings into a group summary).

### Change 2: `deriveMergeRisk` calibration

Replace the current 2+ warnings → "high" logic with per-note risk that actually discriminates:

- 0 warnings → "low"
- 1 non-critical warning → "medium"
- Any critical warning (supersedes chain, stale target) → "high"
- 2+ non-critical warnings → "high"

Critical warnings: supersedes chain, stale target. Non-critical: temporary research, lifecycle mismatch.

This gives: a clean permanent decision note gets "low"; a temporary research note in a permanent group gets "medium"; a note with a supersedes chain gets "high". Actual spread instead of all-high.

### Change 3: `buildConsolidateNoteEvidence` per-note risk

Instead of passing group-level warnings, call `buildNoteWarnings(note, allNotes, targetNote)` for each note and derive risk from that note's specific warnings.

### Change 4: group-level risk and warnings in output

For group-level risk (used in suggestMerges, detectDuplicates pair risk, executeMerge risk):

- Derive from the **maximum** per-note risk in the group (highest risk note determines group risk)
- Group warnings: aggregate all unique per-note warnings, prefixed with note title/id for specificity

### Change 5: text and structured output rendering

Text rendering updates:

- Per-note evidence line: `title | lifecycle, role | Xd | rel:N | risk:low|medium|high` (unchanged format, now with accurate per-note risk)
- Per-note warnings embedded inline: `⚠ temporary research`
- Group warnings: prefix each with the originating note, e.g. `"Source Note: temporary research"` instead of anonymous group warning
- Group risk: derived from max per-note risk

Structured output: `ConsolidateNoteMergeEvidence.warnings` now contains note-specific warnings instead of group warnings. Group-level `warnings` fields contain the aggregated note-specific warnings.

### Change 6: backward compatibility

- `buildMergeWarnings` signature changes: rename to `buildNoteWarnings`, change parameters. Old callers in `index.ts` updated. Keep old name as deprecated alias? No — direct callers are all internal (index.ts + tests). Just update them.
- Add `buildGroupWarnings(notes, targetNote?)` as aggregation helper that calls per-note `buildNoteWarnings` for each note and unions the results with note prefixes.

## Files to change

### `src/consolidate.ts`

- [ ] Replace `buildMergeWarnings` with `buildNoteWarnings(note, notes, targetNote?)` returning note-specific warnings
- [ ] Add `buildGroupWarnings(notes, targetNote?)` that aggregates per-note warnings with note prefixes
- [ ] Fix `deriveMergeRisk` calibration: critical vs non-critical warnings, no 2+ auto-high
- [ ] Fix `buildConsolidateNoteEvidence` to call `buildNoteWarnings` instead of receiving group warnings param
- [ ] Update `ConsolidateNoteEvidence.warnings` to hold note-specific warnings

### `src/structured-content.ts`

- [ ] `ConsolidateNoteMergeEvidence.warnings` — note-specific instead of group
- [ ] Group-level `warnings` fields in `ConsolidateDuplicatePairEvidence`, `ConsolidateMergeSuggestionEvidence`, `ConsolidateExecuteMergeEvidence` — prefixed with originating note

### `src/index.ts`

- [ ] Update detectDuplicates: call `buildNoteWarnings` per note, `buildGroupWarnings` for pair risk
- [ ] Update suggestMerges: call `buildNoteWarnings` per note, aggregate for group risk
- [ ] Update executeMerge: call `buildNoteWarnings` per note, aggregate for group risk
- [ ] Update text rendering to show per-note risk accurately and prefix group warnings

### `tests/consolidate.unit.test.ts`

- [ ] Update `deriveMergeRisk` tests for new calibration
- [ ] Update `buildMergeWarnings` → `buildNoteWarnings` tests
- [ ] Add `buildGroupWarnings` tests
- [ ] Update `buildConsolidateNoteEvidence` tests for per-note warnings

## Success criteria

- Per-note risk spreads across low/medium/high instead of all-high
- Every warning identifies the specific note it applies to
- Group risk = max per-note risk (not count-based threshold)
- All existing tests pass with updated assertions
- Typecheck and build pass
