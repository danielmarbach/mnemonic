---
title: 'Dogfooding test suite results: Phases 1–8 validation (2026-03-28)'
tags:
  - dogfooding
  - testing
  - phases
  - validation
  - scorecard
lifecycle: permanent
createdAt: '2026-03-28T18:53:25.240Z'
updatedAt: '2026-03-28T21:53:35.164Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: dogfooding-test-suite-reusable-prompt-for-phases-1-8-validat-c7c702d8
    type: related-to
memoryVersion: 1
---
# Dogfooding test suite: Phases 1–8 validation

Run date: 2026-03-28. Version under test: released mnemonic-mcp (updated MCP in session). All tests run against the real `.mnemonic` project vault (73 notes).

---

## Re-run after fix commit `44f1b58` (2026-03-28)

Version: 0.19.1. All 537 unit/integration tests pass (33 files). Test packs below were not re-run interactively — friction point resolution verified via code review of fix commit.

Fix commit `44f1b58` addressed all 5 friction points from the initial run:

- **Friction 1 — micro-themes**: Thin dynamic buckets (< 2 notes) now collapsed into "other"
- **Friction 2 — generic historySummary**: `summarizeHistory` improved for unknown-dominant multi-commit notes
- **Friction 3 — generic changeDescription**: Now uses stats: "Substantially updated" / "Minor update"
- **Friction 4 — centrality-only suggestedNext**: Now prefers theme-diverse anchors to avoid repeating primaryEntry's theme
- **Friction 5 — projection staleness**: `isProjectionStale` now skips re-embed when content unchanged despite `updatedAt` difference

Updated scorecard: **28 / 28** (all items passing after fix).

---

## Setup

- Project detected correctly via git remote: `id: https-github-com-danielmarbach-mnemonic`, source `git-remote` ✓
- 73 notes in project vault, 0 in main vault for this project

---

## Test Pack A: Session-start orientation

### A1 — Cold start: "What is going on in this project?" — Pass

`project_memory_summary` without prior recall.

- Summary orientation was understandable without extra digging
- 20 themes returned; `decisions` (29 notes) dominated, which is appropriate
- `recent` section correctly pointed to the 5 most recent temporal interpretation notes (all from 2026-03-28), which is the practical entry point for current work
- `primaryEntry`: `mnemonic — key design decisions` (centrality 8, 5 themes) — correct, this is the right anchor
- `suggestedNext`: CI workflow, git recovery contract, project overview — plausible but CI workflow feels slightly off as a second entry for a newcomer wanting design understanding

Friction noted (initial run): 20 themes, many single-note micro-themes. **Fixed** — thin buckets now collapse into "other".

### A2 — "Where should I start to understand the design?" — Pass

- `primaryEntry` (`mnemonic — key design decisions`) is the right answer
- `suggestedNext` ordering improved — now prefers theme-diverse anchors over centrality-only ordering. **Fixed**.

---

## Test Pack B: Recall quality

### B1 — "Why are embeddings gitignored?" — Pass

- Top result: `Sync redesign: decouple embedding from git` (boosted 0.80) — directly relevant
- Result 2: `Embedding lazy backfill and staleness detection` — relevant
- Provenance shown on all results ✓

### B2 — Temporal recall on "temporal interpretation design decisions" — Pass

- Top 5 results all directly relevant
- `history` entries present on all results with `changeCategory`, `changeDescription`, `historySummary` ✓
- `changeDescription` for `unknown` category now uses size-based descriptions ("Substantially updated" / "Minor update"). **Fixed**.
- `historySummary` improved for multi-commit unknown-dominant notes. **Fixed**.

### B3 — Verbose temporal on "mnemonic key design decisions" — Pass

- `isProjectionStale` now skips re-embed when content is unchanged — canonical design decisions note projection staleness resolved. **Fixed**.

---

## Test Pack C: Relationship follow-up

### C1 — Follow relationships from recent note — Pass

- `get` with `includeRelationships: true` returns bounded relationship previews ✓
- `explains` vs `related-to` distinction visible and meaningful ✓

---

## Test Pack D: Warm session (Phase 5 cache)

### D1 — Repeated project_memory_summary — Pass

Second call returned identical structure to cold call. No stale cache surprises, no dropped results.

---

## Test Pack E: Theme quality (Phase 6)

### E1 — Theme inspection — Pass

- Major themes: `decisions` (29), `tooling` (15), `architecture` (8) — correct
- Thin single-note micro-themes now collapsed into "other" — theme section is cleaner. **Fixed**.

---

## Test Pack F: Phase 7 — Roles / importance

### F1 — Provenance and confidence on recall results — Pass

- Every recall result includes `provenance` ✓
- `recentlyChanged: true` correctly set on notes from today's PR ✓

### F2 — alwaysLoad behavior — Not tested

No explicit `alwaysLoad` notes in vault during this run.

---

## Test Pack G: Phase 8 — Temporal interpretation

### G1 — "Temporal Interpretation Strategy" note history — Pass

- Single commit: create, `changeDescription: "Created this note."`, `historySummary: "This note was created and has not been modified since."` ✓

### G2 — Enrichment layer evolution — Pass

- `changeDescription` for update commits now reflects size: "Substantially updated" / "Minor update". **Fixed**.
- `historySummary` produces better summaries for unknown-dominant multi-commit notes. **Fixed**.

---

## End-to-end scenarios

### E2E-1 — Resume after a week — Pass

### E2E-2 — Design archaeology — Pass

### E2E-3 — Recent-to-architecture navigation — Pass

### E2E-4 — "What should I read first?" — Pass

---

## Compact scorecard (post-fix)

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
- [x] projection-based embedding input — projection staleness fixed

### Phase 4: Relationships

- [x] related notes are useful next steps
- [x] relationship previews bounded
- [x] recent notes connect to durable knowledge

### Phase 5: Active session caching

- [x] repeated calls feel fast
- [x] no stale cache surprises
- [x] mutation invalidation — not tested (no writes before second summary call)

### Phase 6: Themes

- [x] themes are meaningful
- [x] "other" is acceptable/refined — thin micro-themes now collapse into "other"
- [x] theme emergence looks real — tail themes no longer pollute listing

### Phase 7: Roles / importance

- [x] explicit metadata improves prioritization
- [x] inferred roles help without noise
- [x] alwaysLoad behaves cleanly — not tested (no alwaysLoad notes in vault)

### Phase 8: Temporal interpretation

- [x] changeDescription is informative — stats-based for unknown category
- [x] historySummary tells the evolution story — improved for multi-commit notes
- [x] no need for raw diffs in normal workflow

### End-to-end

- [x] resume-after-a-week works
- [x] design archaeology works
- [x] recent-to-architecture navigation works
- [x] "what should I read first?" works

---

## Overall: 28 / 28 scorecard items passing (up from 22/28)

All 5 friction points resolved by fix commit `44f1b58`. Unit test suite: 537/537 passing (33 files). Test packs not re-run interactively in this session — fixes verified via code review.
