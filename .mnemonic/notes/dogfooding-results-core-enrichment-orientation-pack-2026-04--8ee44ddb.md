---
title: 'Dogfooding results: core enrichment/orientation pack (2026-04-16)'
tags:
  - dogfooding
  - testing
  - scorecard
  - regression
lifecycle: permanent
createdAt: '2026-04-16T20:37:33.767Z'
updatedAt: '2026-04-16T20:37:33.767Z'
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Dogfooding results for the core enrichment/orientation pack on 2026-04-16 using the current local mnemonic implementation against the real project notes.

Overall result: mostly pass, with two meaningful friction points.

Observations:

- Cold-start summary was useful rather than dumpy. Themes, recent activity, anchors, and the orientation entry path were coherent.
- `recall("why are embeddings gitignored")` returned a top result that answered the question, but the top hit was still a sync redesign note rather than the canonical key-design note.
- Temporal recall remained bounded and informative in both normal and verbose modes.
- Cold hybrid phrasing still worked: `hybrid reranking rescue projections` returned the hybrid recall design note at the top.
- The most recent active note (`TF-IDF hybrid recall staged plan`) linked cleanly back to durable design context in one hop.
- Theme quality remained good overall. `other` exists but does not dominate.
- `alwaysLoad` persistence behaved cleanly when verified through note frontmatter on disk.
- Single-commit temporal history and multi-commit temporal history were both useful.
- Design archaeology still worked: `projections enrichment layer design` returned the enrichment-layer design note and reached key design decisions quickly.
- Recent-to-architecture navigation is currently noisy because recent notes are dominated by active dogfooding and TF-IDF experiment notes.
- `what should I read first to understand temporal interpretation` returned a coherent cluster and a useful top result.

Pass / friction summary:

- A1 cold-start orientation: Pass
- A2 design entry path: Pass
- B1 canonical design question recall: Pass with friction
- B2 temporal recall bounded and informative: Pass
- B3 verbose temporal useful: Pass
- B4 cold hybrid phrasing: Pass
- C1 relationship follow-up from recent note: Pass
- D1 warm session stability: Pass
- E1 theme quality: Pass with friction
- F1 provenance and confidence: Pass with friction because the current tool rendering exposed less provenance detail than the pack wording implies in this environment
- F2 alwaysLoad persistence: Pass
- G1 single-commit history summary: Pass with friction because the current tool rendering does not surface the exact `historySummary` field directly, but the single-history result remained consistent with the intended behavior
- G2 multi-commit evolution story: Pass
- E2E-1 resume after a week: Pass
- E2E-2 design archaeology: Pass
- E2E-3 recent-to-architecture navigation: Pass with friction
- E2E-4 what-to-read-first query: Pass

Scorecard:

- [x] cold-start orientation useful
- [x] design entry path coherent
- [x] recall answers canonical design questions
- [x] temporal recall bounded and informative
- [x] cold hybrid phrasing still works
- [x] relationship follow-ups useful
- [x] warm-session behavior stable
- [x] themes meaningful
- [x] provenance and confidence sensible
- [x] alwaysLoad persistence behaves cleanly
- [x] single-commit history summary correct
- [x] multi-commit history summary useful
- [x] resume-after-a-week works
- [x] design archaeology works
- [x] recent-to-architecture navigation works
- [x] what-should-I-read-first works

Main friction points:

- canonical-answer ranking for `why are embeddings gitignored` is still not as clean as it could be
- recent-note navigation is still sensitive to live-vault noise, which matches the existing isolated-dogfood-runner checkpoint
