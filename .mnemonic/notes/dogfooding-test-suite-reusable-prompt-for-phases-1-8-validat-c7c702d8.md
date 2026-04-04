---
title: 'Dogfooding test suite: reusable prompt for Phases 1–8 validation'
tags:
  - dogfooding
  - testing
  - phases
  - prompt
  - reusable
lifecycle: permanent
createdAt: '2026-03-28T18:54:38.792Z'
updatedAt: '2026-04-04T20:37:07.773Z'
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: dogfooding-test-suite-results-phases-1-8-validation-2026-03--86866b21
    type: related-to
memoryVersion: 1
---
# Dogfooding test suite: reusable prompt for Phases 1–8 validation

Use this prompt verbatim to re-run the full Phase 1–8 dogfooding test suite against any released version of mnemonic-mcp. Designed to be model-agnostic — works with non-SOTA models.

After running, capture all results in a new note titled "Dogfooding test suite results: Phases 1–8 validation (YYYY-MM-DD)" using the scorecard at the bottom.

---

## Executable prompt

Paste this into a new session with cwd set to the mnemonic repo root:

Run a structured dogfooding test of the mnemonic MCP against the released version. Use cwd=/path/to/mnemonic for all calls. Capture all results in a running MCP note when done.

**SETUP:** Call `detect_project` with cwd to confirm project identity. Call `project_memory_summary` with cwd (cold, no prior recall).

**A1 — Cold start:** Using only the summary output (no recall yet), answer: what are the major themes, what changed recently, where to start? Rate: does the summary feel like a dump or a useful orientation?

**A2 — Design entry path:** Inspect `primaryEntry` from the summary: is it the right anchor for someone new? Inspect `suggestedNext`: do they form a useful reading path for understanding the design? Rate: Pass / Pass with friction / Fail.

**B1 — "Why are embeddings gitignored?"** Call `recall` with that query and cwd. Does the top result answer the question? Is provenance present on results? Rate: Pass / Pass with friction / Fail.

**B2 — Temporal recall:** Call `recall` with query="temporal interpretation design decisions", cwd, mode="temporal", limit=5. Are history entries present? Is `historySummary` meaningful? Is output bounded (no raw diffs)? Rate: Pass / Pass with friction / Fail.

**B3 — Verbose temporal:** Call `recall` with query="mnemonic key design decisions", cwd, mode="temporal", verbose=true, limit=3. Does the canonical key design decisions note rank at top? Are stats context useful? Rate: Pass / Pass with friction / Fail.

**B4 — Cold hybrid recall phrasing:** In a fresh session before any prior `recall` warms projection lookups, call `recall` with query="hybrid reranking rescue projections", cwd, limit=3. Does the hybrid recall design note rank first even though the phrasing is projection-heavy rather than an exact title match? Rate: Pass / Pass with friction / Fail.

**C1 — Relationship follow-up from recent note:** Identify the most recent note from the summary's recent section. Call `get` with that id, cwd, includeRelationships=true. Follow one relationship: does it lead to a useful connected note? Rate: Pass / Pass with friction / Fail.

**D1 — Warm session (Phase 5 cache):** Call `project_memory_summary` a second time (same session, same cwd). Same structure? Any dropped results? Felt faster? Rate: Pass / Pass with friction / Fail.

**E1 — Theme quality (Phase 6):** Count themes from the summary output. How many have only 1 note? Does "other" appear? Are the top 3 themes meaningful? Rate: Pass / Pass with friction / Fail.

**F1 — Provenance and confidence (Phase 7):** From recall results (B1 or B2), inspect provenance: lastUpdatedAt, lastCommitHash, recentlyChanged. Is confidence "high" on anchor notes? "medium" on others? Rate: Pass / Pass with friction / Fail.

**F2 — AlwaysLoad via MCP (Phase 7):** Create a test note with `remember` including `alwaysLoad: true`, then update it with `alwaysLoad: false`. Use the returned note id to inspect `/path/to/mnemonic/.mnemonic/notes/<id>.md` directly and verify the frontmatter changes from `alwaysLoad: true` to `alwaysLoad: false`. Rate: Pass / Pass with friction / Fail.

**G1 — Single-commit note history (Phase 8):** From B2 temporal results, find a note with 1 commit. Is `historySummary` "This note was created and has not been modified since."? Rate: Pass / Pass with friction / Fail.

**G2 — Multi-commit note evolution (Phase 8):** Find a note with 3+ commits from B2 temporal results. Is `historySummary` informative or generic? Is `changeDescription` for unknown category helpful or just "Updated the note."? Rate: Pass / Pass with friction / Fail.

**E2E-1 — Resume after a week:** From `project_memory_summary` alone (no recall), can you re-orient on current project work? Rate: Pass / Pass with friction / Fail.

**E2E-2 — Design archaeology:** Call `recall` with query="projections enrichment layer design" and cwd. Does top result cover the design? Can you reach the key design decisions note in 2 hops via relationships? Rate: Pass / Pass with friction / Fail.

**E2E-3 — Recent-to-architecture navigation:** Start from the most recent note (from summary). Via `get` + includeRelationships, navigate to an architecture or decisions note. Does the path work in 3 steps or fewer? Rate: Pass / Pass with friction / Fail.

**E2E-4 — "What should I read first?"** Call `recall` with query="what should I read first to understand temporal interpretation" and cwd. Does the right note rank at top? Do its relationships form a coherent cluster? Rate: Pass / Pass with friction / Fail.

**CLEANUP:** Call `forget` on any test notes created during F2.

**CAPTURE:** Call `remember` with title "Dogfooding test suite results: Phases 1–8 validation (YYYY-MM-DD)", lifecycle permanent, scope project, tags [dogfooding, testing, phases, validation, scorecard], containing all test results and completed scorecard.

---

## Scorecard template (copy into results note)

### Phase 1: Provenance + confidence

- [ ] provenance useful
- [ ] confidence sensible
- [ ] freshness easy to judge

### Phase 2: Temporal recall

- [ ] temporal mode useful
- [ ] output bounded
- [ ] history retrieval reliable

### Phase 3: Projections

- [ ] previews feel concise and useful
- [ ] recall quality preserved
- [ ] no obvious loss from projection-based embedding input
- [ ] cold hybrid recall reranking works for projection-heavy phrasing

### Phase 4: Relationships

- [ ] related notes are useful next steps
- [ ] relationship previews are bounded
- [ ] recent notes connect back to durable knowledge

### Phase 5: Active session caching

- [ ] repeated calls feel faster
- [ ] no stale cache surprises
- [ ] mutation invalidation works

### Phase 6: Themes

- [ ] themes are meaningful
- [ ] "other" is acceptable/refined
- [ ] theme emergence looks real
- [ ] non-English/mixed notes degrade gracefully

### Phase 7: Roles / importance

- [ ] explicit metadata improves prioritization
- [ ] inferred roles help without noise
- [ ] alwaysLoad behaves cleanly (F2 test: remember/update via MCP, verify frontmatter in note file)

### Phase 8: Temporal interpretation

- [ ] changeDescription is informative
- [ ] historySummary tells the evolution story
- [ ] no need for raw diffs in normal workflow

### End-to-end

- [ ] resume-after-a-week works
- [ ] design archaeology works
- [ ] recent-to-architecture navigation works
- [ ] "what should I read first?" works

---

## Known runs

- 2026-03-28: note `dogfooding-test-suite-results-phases-1-8-validation-2026-03--86866b21`, run by Claude Sonnet 4.6, result 22/28 passing.
- 2026-03-29: note `dogfooding-test-suite-results-phases-1-8-validation-2026-03--86866b21`, run by Claude Sonnet 4.6, result 28/28 passing (v0.19.2).
