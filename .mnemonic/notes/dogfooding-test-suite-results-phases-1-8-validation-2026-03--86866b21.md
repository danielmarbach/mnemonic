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
updatedAt: '2026-03-29T08:51:18.357Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: dogfooding-test-suite-reusable-prompt-for-phases-1-8-validat-c7c702d8
    type: related-to
memoryVersion: 1
---
# Dogfooding test suite: Phases 1–8 validation

Run date: 2026-03-29. Version under test: 0.19.2. All tests run against the real `.mnemonic` project vault.

---

## Re-run after fix commit `5d85de6` (2026-03-29)

Version: 0.19.2. All 530 unit/integration tests pass (33 files). Test packs re-run interactively via MCP in this session.

**Key fix in this version:** `src/provenance.ts` now always computes stats (removed `verbose` gating). Stats were previously only populated in verbose mode, which blocked category reclassification from `unknown` to `expand` in non-verbose temporal mode. Now classification works correctly in both modes.

**Test fix applied:** `tests/relationships.unit.test.ts` boundary test was flaky — `setDate(getDate() - 5)` created a timestamp that evaluated to 4 (not 5) days due to timing. Fixed to subtract `5 days + 1 minute` via `Date.now()` arithmetic.

**Note:** Test count reduced from 537 (v0.19.1) to 530 (v0.19.2) because `tests/provenance.unit.test.ts` was refactored as part of the stats fix.

---

## Previous run: `44f1b58` (2026-03-28)

Version: 0.19.1. All 537 unit/integration tests passed. 27/28 scorecard items passing — one item `[~]`: `historySummary` for multi-commit unknown-dominant notes was generic in non-verbose mode because stats were only fetched in verbose mode.

---

## Setup

- Project detected correctly via git remote: `id: https-github-com-danielmarbach-mnemonic`, source `git-remote` ✓
- 76 notes in project vault, 0 in main vault for this project

---

## Test Pack A: Session-start orientation

### A1 — Cold start: "What is going on in this project?" — Pass ✓

### A2 — "Where should I start to understand the design?" — Pass ✓

---

## Test Pack B: Recall quality

### B1 — "Why are embeddings gitignored?" — Pass ✓

### B2 — Temporal recall (non-verbose) on "temporal interpretation design decisions" — **Pass ✓ (FIXED)**

Previously `[~]`: enrichment-layer note (3 commits) returned `changeCategory: "unknown"` and `changeDescription: "Updated the note."` in non-verbose mode.

Now fixed: all commits correctly classified as `expand` with `"Added substantial explanatory content."` in non-verbose mode.

- Enrichment-layer note: all commits `changeCategory: "expand"`, `changeDescription: "Added substantial explanatory content."` ✓
- `historySummary`: "The core decision remained stable while rationale and examples expanded." ✓

### B3 — Verbose temporal on "mnemonic key design decisions" — Pass ✓

---

## Test Pack C–G: All previously passing tests

- C1 Relationship follow-up: Pass ✓
- D1 Warm session: Pass ✓
- E1 Theme quality: Pass ✓
- F1 Provenance and confidence: Pass ✓
- G1 Single-commit temporal: Pass ✓
- G2 Enrichment layer verbose temporal: Pass ✓

---

## Compact scorecard (post-fix v0.19.2)

### Phase 8: Temporal interpretation

- [x] changeDescription is informative — **fixed in both verbose and non-verbose mode**
- [x] historySummary tells the evolution story — **fixed in both verbose and non-verbose mode**
- [x] no need for raw diffs in normal workflow

---

## Overall: **28 / 28 scorecard items passing**

All items fully resolved. Non-verbose temporal classification now works correctly for multi-commit notes because stats are always computed (no longer gated behind `verbose`). Unit test suite: 530/530 passing.

Root cause of the previous `[~]` item: stats object was only populated when `verbose: true` in `src/provenance.ts`; classification of `unknown` into `expand`/`refine` depended on stats; non-verbose callers never got reclassification. Fix: always compute stats; strip them from output when not in verbose mode (done in `src/index.ts` post-enrichment).
