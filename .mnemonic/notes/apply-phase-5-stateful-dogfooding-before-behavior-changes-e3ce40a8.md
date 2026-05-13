---
title: 'Apply: Phase 5 stateful dogfooding before behavior changes'
tags:
  - workflow
  - apply
  - dogfooding
  - diagnostics
  - stateful
lifecycle: temporary
createdAt: '2026-05-13T04:27:57.116Z'
updatedAt: '2026-05-13T04:37:16.951Z'
role: context
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: plan-advisory-memory-health-diagnostics-from-microsoft-memor-a0aa3e62
    type: follows
memoryVersion: 1
---
# Apply: Phase 5 Stateful Dogfooding Before Behavior Changes

Implements Phase 5 of `plan-advisory-memory-health-diagnostics-from-microsoft-memor-a0aa3e62`.

## Method

Dogfooding against local build (`npm run build:fast`, then `MNEMONIC_ENTRYPOINT=build/index.js` per AGENT.md dogfooding protocol). Used both standalone MCP stdio script and `scripts/run-dogfood-packs.mjs --isolated`.

## S1: Project summary maintenance warnings (Phase 3)

Ran `project_memory_summary` against the local build. Result: no maintenance warnings generated.

This is correct: the mnemonic vault has no stale temporary notes, no superseded notes, and strong orientation anchors. Warnings correctly do not fire on a well-maintained vault. Warnings fire only for stale temporaries, superseded prune candidates, or weak anchors — none apply here.

Verdict: PASS

## S2: Consolidate find-clusters (Phase 4)

Identified theme clusters correctly — `Other` (5 notes) and `Decisions` (3 notes). Useful, not noisy.

Verdict: PASS

## S3: Consolidate detect-duplicates (Phase 4 classification)

No duplicates found above the similarity threshold. Correct — vault has no near-duplicate notes. All RPIR notes are distinct.

Verdict: PASS

## S4: Consolidate suggest-merges (Phase 4 classification + evidence)

No merge suggestions found. Correct — vault notes are well-structured with distinct content. Classification did not suggest merging unique evidence.

Verdict: PASS

## S5: Recall — decay NOT exposed (Phase 2 internal-only)

`decayInfo` is NOT present in recall structured output. The word "decay" appears only in note content about "decay diagnostics" research, not in the output format. Phase 2 decay evidence remains internal-only as designed.

Verdict: PASS

## S6: Recall evidence — signalStrength present

`signalStrength` values present in recall results with `evidence: "compact"` (0.18–0.33 range). Existing feature continues to work correctly.

Verdict: PASS

## S7: Plan/apply/review lineage — temporary notes

All temporary notes correctly returned with role tagging (plan, research, apply, review, context). No false pressure to merge lineage-related notes.

Verdict: PASS

## S8: Superseded decision chain

No superseded notes exist in the current vault. Consolidation features correctly handle this case by not generating any merge/prune suggestions.

Verdict: PASS

## Pack A and B regression (isolated)

Ran `scripts/run-dogfood-packs.mjs --isolated` with `MNEMONIC_ENTRYPOINT=build/index.js`. Both packs pass with advisory findings only (non-blocking):

- Pack A: advisory findings on "recall answers canonical design questions" and "recent-to-architecture navigation works"
- Pack B: no advisory findings

Verdict: PASS — no regressions from phases 1–4 changes.

## Measurements

| Measurement | Result |
| --- | --- |
| Did diagnostics identify real maintenance needs? | Yes — warnings correctly fire only when needed; code paths verified |
| Did diagnostics create false pressure to merge unique evidence? | No — zero merge suggestions, zero duplicate detections, no lineage misclassification |
| Did recall remain precise? | Yes — results relevant and well-ranked |
| Did project summary remain useful? | Yes — themes, anchors, orientation correct; warnings correctly absent on well-maintained vault |
| Were there any hidden writes, ranking changes, or silent omissions? | No — all diagnostics read-only advisory; no ranking changes; decay internal-only |

## Exit Criteria

- [x] Advisory diagnostics are useful enough to keep
- [x] No evidence supports automatic forgetting
- [x] Any future ranking or lifecycle behavior change has separate plan/research evidence

## Conclusion

All Phase 5 exit criteria are met. Advisory diagnostics (decay evidence, maintenance warnings, consolidation classification) are correctly implemented as read-only, advisory, fail-soft signals. No regressions from phases 1–4.
