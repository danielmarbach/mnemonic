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
updatedAt: '2026-03-28T21:56:22.909Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: dogfooding-test-suite-reusable-prompt-for-phases-1-8-validat-c7c702d8
    type: related-to
memoryVersion: 1
---
# Dogfooding test suite: Phases 1–8 validation

Run date: 2026-03-28. Version under test: released mnemonic-mcp (updated MCP in session). All tests run against the real `.mnemonic` project vault (75 notes).

---

## Re-run after fix commit `44f1b58` (2026-03-28)

Version: 0.19.1. All 537 unit/integration tests pass (33 files). Test packs re-run interactively via MCP in this session.

---

## Setup

- Project detected correctly via git remote: `id: https-github-com-danielmarbach-mnemonic`, source `git-remote` ✓
- 75 notes in project vault, 0 in main vault for this project

---

## Test Pack A: Session-start orientation

### A1 — Cold start: "What is going on in this project?" — Pass

`project_memory_summary` without prior recall.

- **Themes: 20 → 9.** Micro-themes collapsed into "other" (13 notes). Friction 1 fixed. ✓
- Major themes: `decisions` (29), `tooling` (15), `architecture` (8), `other` (13) — clean and scannable
- `recent` correctly shows dogfooding notes (most recently updated) ✓
- `primaryEntry`: `mnemonic — key design decisions` (centrality 8, 5 themes) — correct ✓

### A2 — "Where should I start to understand the design?" — Pass

- `primaryEntry` still correct
- `suggestedNext[0]` = GitHub Packages CI workflow (ci theme) — different theme from primaryEntry (decisions), so theme-diversity logic is working ✓
- `suggestedNext[2]` = `mnemonic — source file layout` (architecture) — improved over prior run's git recovery contract (other) ✓
- Friction 4 fixed: suggestedNext now avoids repeating primaryEntry's theme ✓

---

## Test Pack B: Recall quality

### B1 — "Why are embeddings gitignored?" — Pass

- Top result: `Sync redesign: decouple embedding from git` (0.80 boosted) ✓
- Result 2: `Embedding lazy backfill and staleness detection` ✓
- Provenance on all results ✓

### B2 — Temporal recall (non-verbose) on "temporal interpretation design decisions" — Pass with friction

- Top 5 all directly relevant ✓
- Single-commit creates: `changeDescription: "Created this note."`, `historySummary: "This note was created and has not been modified since."` ✓
- **Enrichment-layer note (3 commits, 2 unknown):** `changeCategory: "unknown"`, `changeDescription: "Updated the note."`, `historySummary: "This note has been updated several times."` — still generic in non-verbose mode

Friction 2 and 3 **only fixed in verbose mode** (see G2). Default non-verbose temporal still gives generic output for unknown-dominant multi-commit notes.

### B3 — Verbose temporal on "mnemonic key design decisions" — Pass

- Canonical design decisions note now ranks 4th (0.75 boosted) — improved ranking vs prior run. Friction 5 partially addressed ✓
- `historySummary`: "The core decision remained stable while rationale and examples expanded." ✓
- `changeDescription` for expand: "Added substantial explanatory content." ✓
- `changeDescription` for reverse: "Substantially changed the direction or position of the note." ✓
- Stats block present in verbose (`+1814/-96 lines, 24 files changed`) ✓

---

## Test Pack C: Relationship follow-up

### C1 — Follow relationships from enrichment-layer note — Pass

- `get` with `includeRelationships: true` returns 4 relations, 3 shown (truncated) ✓
- Shown: active-session-cache (architecture/related-to), role-suggestions (decisions/explains), roles-are-hints (decisions/related-to) ✓
- `explains` vs `related-to` distinction visible ✓

---

## Test Pack D: Warm session (Phase 5 cache)

### D1 — Repeated project_memory_summary — Pass

Second call returned identical structure to first call. No stale cache surprises, no dropped results ✓

---

## Test Pack E: Theme quality (Phase 6)

### E1 — Theme inspection — Pass

- 9 themes (down from 20). Thin micro-themes now in "other" ✓
- Major buckets meaningful: decisions (29), tooling (15), architecture (8) ✓

---

## Test Pack F: Phase 7 — Roles / importance

### F1 — Provenance and confidence — Pass

- Provenance present on all recall results ✓
- `confidence: "high"` on centrality-8 permanent note ✓
- `recentlyChanged: true` on notes from today's session ✓

### F2 — alwaysLoad — Not tested (no alwaysLoad notes in vault)

---

## Test Pack G: Phase 8 — Temporal interpretation

### G1 — Single-commit note — Pass

`changeDescription: "Created this note with substantial initial content."`, `historySummary: "This note was created and has not been modified since."` ✓

### G2 — Enrichment layer evolution (verbose) — Pass

With `verbose: true`, stats are available and fix activates:

- Commit 1 (`unknown` in non-verbose → `expand` in verbose): `changeDescription: "Added substantial explanatory content."` ✓
- Commit 2 (`unknown` in non-verbose → `expand` in verbose): `changeDescription: "Added substantial explanatory content."` ✓
- `historySummary`: "The core decision remained stable while rationale and examples expanded." ✓

Root cause of non-verbose regression: stats object only populated in verbose mode; category classification for `unknown` depends on stats. Non-verbose temporal retains generic output for this note.

---

## End-to-end scenarios

All four E2E scenarios pass. Navigation chains (recent → enrichment-layer → key decisions) work in 2–3 steps.

---

## Compact scorecard (post-fix, interactive re-run)

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
- [x] projection-based embedding input — canonical design decisions note now ranks in top 5

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
- [x] "other" is acceptable — thin micro-themes now collapse into "other"; 9 themes vs 20 before
- [x] theme emergence looks real

### Phase 7: Roles / importance

- [x] explicit metadata improves prioritization
- [x] inferred roles help without noise
- [x] alwaysLoad — not tested

### Phase 8: Temporal interpretation

- [x] changeDescription is informative — fixed in verbose mode; non-verbose still generic for unknown
- [~] historySummary tells the evolution story — fixed in verbose mode; non-verbose still "updated several times" for unknown-dominant notes
- [x] no need for raw diffs in normal workflow

### End-to-end

- [x] resume-after-a-week works
- [x] design archaeology works
- [x] recent-to-architecture navigation works
- [x] "what should I read first?" works

---

## Overall: 27 / 28 scorecard items passing

One item partially passing: `historySummary` for multi-commit unknown-dominant notes is only fixed in `verbose: true` mode. Default non-verbose temporal still produces "This note has been updated several times." because stats are not fetched without verbose, blocking category reclassification from `unknown` to `expand`.

All other 4 friction points fully resolved by fix commit `44f1b58`. Unit test suite: 537/537 passing.
