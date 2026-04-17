---
title: 'Dogfooding results: core enrichment/orientation pack (2026-04-17)'
tags:
  - dogfooding
  - testing
  - scorecard
  - regression
lifecycle: permanent
createdAt: '2026-04-17T13:25:35.890Z'
updatedAt: '2026-04-17T13:25:35.890Z'
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
## Pack A — Core enrichment and orientation regression (2026-04-17)

Mnemonic v0.23.0, run against live project vault (78 notes), same session.

### Test results

- A1 Cold start: **Pass** — 8 themes, recent activity visible, orientation useful
- A2 Design entry path: **Pass** — primaryEntry = key design decisions (centrality 8), suggestedNext coherent
- B1 Embeddings gitignored: **Pass with friction** — Top hit is sync redesign (0.651), not the direct "why gitignored" answer. Recoverable from top 2 hits.
- B2 Temporal recall: **Pass** — History entries present, changeDescription meaningful, bounded
- B3 Verbose temporal: **Pass** — Key design decisions at top, verbose stats useful (file change counts)
- B4 Cold hybrid phrasing: **Pass** — Hybrid recall design note (0.693) ranks first despite projection-heavy phrasing
- C1 Relationship follow-up: **Pass** — Recent note to key design decisions in 1 hop
- D1 Warm session: **Pass** — Same structure, no dropped results, fast
- E1 Theme quality: **Pass with friction** — "Other" bucket has 3 notes; 1 single-note theme (Overview). Top 3 themes meaningful.
- F1 Provenance/confidence: **Pass** — Provenance present, confidence "high" on anchors, "medium" on periphery
- F2 AlwaysLoad toggle: **Pass** — remember(alwaysLoad:true) then update(alwaysLoad:false), frontmatter correct
- G1 Single-commit history: **Pass** — "Created this note with substantial initial content."
- G2 Multi-commit history: **Pass** — changeDescriptions informative (substantial update, reorganized, etc.)
- E2E-1 Resume after a week: **Pass** — Summary alone sufficient for re-orientation
- E2E-2 Design archaeology: **Pass** — Enrichment layer design to key design decisions in 1 hop
- E2E-3 Recent-to-architecture: **Pass** — Recent note to architecture in 1 step (within 3-step budget)
- E2E-4 What should I read first: **Pass** — Temporal interpretation strategy at top, coherent relationship cluster

### Scorecard

- [x] cold-start orientation useful
- [x] design entry path coherent
- [x] recall answers canonical design questions
- [x] temporal recall bounded and informative
- [x] cold hybrid phrasing still works
- [x] relationship follow-ups useful
- [x] warm-session behavior stable
- [x] themes meaningful (with minor "Other" bucket noise)
- [x] provenance and confidence sensible
- [x] alwaysLoad persistence behaves cleanly
- [x] single-commit history summary correct
- [x] multi-commit history summary useful
- [x] resume-after-a-week works
- [x] design archaeology works
- [x] recent-to-architecture navigation works
- [x] "what should I read first?" works

### Friction notes

- B1: The "why are embeddings gitignored" query hits sync redesign first rather than key design decisions where the explicit rationale lives. The hybrid weight (12%) was not enough to pull the direct answer above the sync redesign note. Consider whether this is acceptable or whether the key design decisions note needs a stronger lexical signal for the "gitignored" phrasing.
- E1: "Other" bucket could be reduced by routing Phase 2 working-state continuity to Decisions and Changelog writing principles to Tooling. This is a theme-routing refinement, not a correctness issue.
