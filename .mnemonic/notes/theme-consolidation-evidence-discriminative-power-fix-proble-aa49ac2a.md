---
title: >-
  Theme: Consolidation evidence discriminative power fix — problem analysis and
  resolution
tags:
  - evidence
  - consolidate
  - design
  - theme
  - research
  - merge-decisions
lifecycle: permanent
createdAt: '2026-04-28T15:58:57.877Z'
updatedAt: '2026-04-28T16:06:00.252Z'
role: reference
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: dogfood-findings-consolidation-evidence-metadata-alone-insuf-7278ec64
    type: derives-from
  - id: decision-expose-trust-evidence-at-decision-points-via-opt-in-244d8317
    type: explains
memoryVersion: 1
---
# Theme: Consolidation evidence discriminative power — problem analysis and resolution

This note preserves the problem analysis that led to fixing consolidation evidence warnings/risk. The decision and summary notes capture *what was built*; this captures *what went wrong and why*.

## Three concrete problems found via dogfooding

### Problem 1: mergeRisk is always "high" for non-trivial groups

`deriveMergeRisk` logic: 2+ warnings → "high". With even a small group of notes (5+), you almost always hit 2+ of the 4 heuristics (temporary research, supersedes chain, stale summary risk, lifecycle mismatch). In dogfood, 97 out of 97 notes in a suggest-merges result were `risk:high`. The signal had zero discriminative power.

### Problem 2: per-note risk equals group risk

`buildConsolidateNoteEvidence` passed the same group-level `mergeWarnings` to every note's `deriveMergeRisk`. A purely permanent decision note with no relationships still got `risk:high` because some other note in the group was temporary/research. The per-note risk column was redundant with the group risk — it didn't tell you which specific note is risky.

### Problem 3: warnings are group-level, not note-specific

The four heuristics fired on the entire note set: "temporary research note in merge" didn't say which note, "note supersedes another" didn't say which one. For 2-3 note pairs this was fine. For 5+ notes in a suggestion, the warning was too coarse to act on.

## Root cause

`buildMergeWarnings` was designed for the "should I merge these 2-3 notes?" case. It checked properties of the entire group, not properties of individual notes relative to the group. And `deriveMergeRisk` treated 2+ warnings as "high" which collapsed all non-trivial cases into the same bucket.

## Resolution

1. **Per-note warnings**: `buildNoteWarnings(note, allNotes, targetNote?)` returns note-specific warnings instead of group-level `buildMergeWarnings`.
2. **Per-note risk**: `buildConsolidateNoteEvidence` derives risk from note-specific warnings, not group-level warnings.
3. **Group risk**: `aggregateMergeRisk` computes max per-note risk instead of count-based threshold.
4. **Risk calibration**: critical warnings (supersedes chain, stale summary) → "high"; non-critical → "medium" (single) or "high" (2+).
5. **Warning specificity**: group warnings prefixed with originating note title for actionability.

Both text and structured output were updated.
