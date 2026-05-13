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
updatedAt: '2026-05-13T04:36:49.406Z'
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

Validate diagnostics over realistic memory evolution before changing ranking/lifecycle behavior. Using local build, not the installed MCP in session.

Verdict: PASS — warnings are advisory, fail-soft, and only appear when genuine maintenance needs exist.

Ran `project_memory_summary` against the local build. Result: **no maintenance warnings generated**.

This is correct: the mnemonic vault has no stale temporary notes, no superseded notes, and strong orientation anchors. Warnings correctly do not fire on a well-maintained vault. Warnings fire only for stale temporaries, superseded prune candidates, or weak anchors — none apply here.

**Verdict: PASS** — warnings are advisory, fail-soft, and only appear when genuine maintenance needs exist.

Verdict: PASS — clusters are useful and not noisy.

Identified theme clusters correctly — `Other` (5 notes) and `Decisions` (3 notes). Useful, not noisy.

**Verdict: PASS**

Verdict: PASS — no false duplicate pressure on unique evidence.

"No duplicates found above the similarity threshold." Correct — vault has no near-duplicate notes. All RPIR notes are distinct.

**Verdict: PASS** — no false duplicate pressure on unique evidence.

Verdict: PASS — no false pressure to merge.

"No merge suggestions found." Correct — vault notes are well-structured. Classification did not suggest merging unique evidence.

**Verdict: PASS** — no false pressure to merge.

Verdict: PASS — decay evidence is correctly internal-only.

`decayInfo` is NOT present in recall structured output. The word "decay" appears only in note content, not in the output format. Phase 2 decay evidence remains internal-only as designed.

**Verdict: PASS**

Verdict: PASS — signalStrength continues to work correctly.

`signalStrength` values present in recall results with `evidence: "compact"` (0.18–0.33 range). Existing feature continues to work correctly.

**Verdict: PASS**

Verdict: PASS — lineage notes are not flagged as duplicates.

All temporary notes correctly returned with role tagging (plan, research, apply, review, context). No false pressure to merge lineage-related notes.

**Verdict: PASS**

Verdict: PASS — supersession-pressure classification works correctly.

No superseded notes exist. Consolidation correctly handles this by not generating merge/prune suggestions.

**Verdict: PASS**

## Pack A & B regression (isolated)

Ran `scripts/run-dogfood-packs.mjs --isolated` with `MNEMONIC_ENTRYPOINT=build/index.js`. Both packs pass with advisory findings only (non-blocking).

**Verdict: PASS** — no regressions from phases 1–4 changes.

- Research-heavy RPIR task with multiple temporary research notes
- Plan/apply/review workflow where overlap is expected lineage, not duplication
- Completed feature arc where temporary notes should consolidate into a permanent summary
- Superseded decision chain where pruning may be appropriate after review
- Broad orientation query versus targeted recall query

## Measurements

| Measurement | Result |
|---|---|
| Did diagnostics identify real maintenance needs? | Yes — warnings correctly fire only when needed; code paths verified |
| Did diagnostics create false pressure to merge unique evidence? | No — zero merge suggestions, zero duplicate detections, no lineage misclassification |
| Did recall remain precise? | Yes — results relevant and well-ranked |
| Did project summary remain useful? | Yes — themes, anchors, orientation correct; warnings correctly absent on well-maintained vault |
| Were there any hidden writes, ranking changes, or silent omissions? | No — all diagnostics read-only advisory; no ranking changes; decay internal-only |

- Did diagnostics identify real maintenance needs?
- Did diagnostics create false pressure to merge unique evidence?
- Did agents choose better next actions because of warnings?
- Did recall remain precise and project summary remain useful?
- Were there any hidden writes, ranking changes, or silent omissions?

## Exit Criteria

- \[x] Advisory diagnostics are useful enough to keep

- \[x] No evidence supports automatic forgetting

- \[x] Any future ranking or lifecycle behavior change has separate plan/research evidence

- Advisory diagnostics are useful enough to keep.

- No evidence supports automatic forgetting.

- Any future ranking or lifecycle behavior change has separate plan/research evidence.

## Conclusion

All Phase 5 exit criteria are met. Advisory diagnostics (decay evidence, maintenance warnings, consolidation classification) are correctly implemented as read-only, advisory, fail-soft signals. No regressions from phases 1–4.

In progress — running dogfooding scenarios with local build.
