---
title: >-
  Research: consolidation evidence lacks discriminative power for merge
  decisions
tags:
  - evidence
  - consolidate
  - research
lifecycle: temporary
createdAt: '2026-04-28T11:41:31.788Z'
updatedAt: '2026-04-28T11:51:22.737Z'
role: research
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: plan-fix-consolidation-evidence-discriminative-power-2c34bb7b
    type: derives-from
memoryVersion: 1
---
# Research: consolidation evidence lacks discriminative power for merge decisions

## Finding

Dogfooding the local MCP build revealed three concrete problems that make consolidation evidence unhelpful for actual merge decisions:

### Problem 1: mergeRisk is always "high" for non-trivial groups

`deriveMergeRisk` logic: 2+ warnings → "high". With even a small group of notes (5+), you almost always hit 2+ of the 4 heuristics (temporary research, supersedes chain, stale summary risk, lifecycle mismatch). In dogfood, 97 out of 97 notes in a suggest-merges result were `risk:high`. The signal has zero discriminative power.

### Problem 2: per-note risk equals group risk

`buildConsolidateNoteEvidence` passes the same group-level `mergeWarnings` to every note's `deriveMergeRisk`. A purely permanent decision note with no relationships still gets `risk:high` because some other note in the group is temporary/research. The per-note risk column is redundant with the group risk — it doesn't tell you which specific note is risky.

### Problem 3: warnings are group-level, not note-specific

The four heuristics fire on the entire note set: "temporary research note in merge" doesn't say which note, "note supersedes another" doesn't say which one. For 2-3 note pairs this is fine. For 5+ notes in a suggestion, the warning is too coarse to act on.

## Root cause

`buildMergeWarnings` was designed for the "should I merge these 2-3 notes?" case. It checks properties of the entire group, not properties of individual notes relative to the group. And `deriveMergeRisk` treats 2+ warnings as "high" which collapses all non-trivial cases into the same bucket.

## Proposed scope (user-confirmed)

Fix all three: per-note risk accuracy, group risk calibration, and warning specificity. Both text and structured output must be supported.
