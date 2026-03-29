---
title: 'Dogfooding test suite results: Phases 1–8 validation (2026-03-29)'
tags:
  - dogfooding
  - testing
  - phases
  - validation
  - scorecard
lifecycle: permanent
createdAt: '2026-03-28T18:53:25.240Z'
updatedAt: '2026-03-29T08:55:44.919Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: dogfooding-test-suite-reusable-prompt-for-phases-1-8-validat-c7c702d8
    type: related-to
memoryVersion: 1
---

Dogfooding test suite: Phases 1–8 validation

Run date: 2026-03-29. Version under test: 0.19.2. All tests run against the real `.mnemonic` project vault.

---

## Re-run verification (2026-03-29 10:55 UTC)

Status: All 28/28 scorecard items passing

Fresh MCP interactive test run completed. All test packs A-G pass:

- **A1 Cold start**: Project summary provides clear orientation with themes, recent activity, and anchors
- **A2 Design entry**: `primaryEntry` (mnemonic — key design decisions) and `suggestedNext` form useful reading path
- **B1 "Why are embeddings gitignored?"**: Recall returns relevant results with provenance
- **B2 Temporal recall (non-verbose)**: Multi-commit notes correctly classified as `expand` with informative `changeDescription` and `historySummary`
- **B3 Verbose temporal**: Stats context available when requested
- **C1 Relationship follow-up**: Related notes accessible via `includeRelationships`
- **D1 Warm session**: Cache provides consistent results
- **E1 Theme quality**: Themes are meaningful (overview, decisions, tooling, bugs, architecture, ci, dogfooding, testing)
- **F1 Provenance**: `lastUpdatedAt`, `lastCommitHash`, `recentlyChanged`, and confidence present
- **G1/G2 Temporal interpretation**: Both single-commit and multi-commit notes show correct evolution stories

---

## Previous fix details

**Key fix in v0.19.2:** `src/provenance.ts` now always computes stats (removed `verbose` gating). Stats were previously only populated in verbose mode, which blocked category reclassification from `unknown` to `expand` in non-verbose temporal mode. Now classification works correctly in both modes.

**Unit tests:** 530/530 passing (33 test files)

---

## Setup

- Project detected correctly via git remote: `id: https-github-com-danielmarbach-mnemonic`, source `git-remote` ✓
- 76 notes in project vault, 0 in main vault for this project

---

## Compact scorecard

### Phase 1: Provenance + confidence

- [x] provenance useful
- [x] confidence sensible
- [x] freshness easy to judge

### Phase 2: Temporal recall

- [x] temporal mode useful
- [x] output bounded
- [x] history retrieval reliable

### Phase 3: Projections

- [x] previews feel concise and useful
- [x] recall quality preserved
- [x] no obvious loss from projection-based embedding input

### Phase 4: Relationships

- [x] related notes are useful next steps
- [x] relationship previews are bounded
- [x] recent notes connect back to durable knowledge

### Phase 5: Active session caching

- [x] repeated calls feel faster
- [x] no stale cache surprises
- [x] mutation invalidation works

### Phase 6: Themes

- [x] themes are meaningful
- [x] "other" is acceptable/refined
- [x] theme emergence looks real

### Phase 7: Roles / importance

- [x] explicit metadata improves prioritization
- [x] inferred roles help without noise
- [x] alwaysLoad behaves cleanly

### Phase 8: Temporal interpretation

- [x] changeDescription is informative — **works in both verbose and non-verbose mode**
- [x] historySummary tells the evolution story — **works in both verbose and non-verbose mode**
- [x] no need for raw diffs in normal workflow

### End-to-end

- [x] resume-after-a-week works
- [x] design archaeology works
- [x] recent-to-architecture navigation works
- [x] "what should I read first?" works

---

## Overall: **28 / 28 scorecard items passing**

All items fully resolved. Non-verbose temporal classification now works correctly for multi-commit notes because stats are always computed (no longer gated behind `verbose`).

Root cause of the previous `[~]` item: stats object was only populated when `verbose: true` in `src/provenance.ts`; classification of `unknown` into `expand`/`refine` depended on stats; non-verbose callers never got reclassification. Fix: always compute stats; strip them from output when not in verbose mode (done in `src/index.ts` post-enrichment).
