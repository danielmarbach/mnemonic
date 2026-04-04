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
updatedAt: '2026-04-04T20:37:07.918Z'
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: dogfooding-test-suite-reusable-prompt-for-phases-1-8-validat-c7c702d8
    type: related-to
memoryVersion: 1
---
Dogfooding test suite: Phases 1–8 validation

Original run date: 2026-03-29. Latest rerun: 2026-04-04. Latest run used the current local `build/index.js` from branch `recall-ranking` against the real `.mnemonic` project vault.

---

## Re-run verification (2026-04-04)

Status: 27/30 scorecard items passing

Fresh MCP interactive dogfooding run completed against the current branch build. The new cold hybrid recall scenario passes, but the rerun also exposed three workflow gaps in the reusable pack assumptions and current note graph.

### Pack-by-pack results

- **A1 Cold start**: Pass. `project_memory_summary` still provides a clear orientation with themes, recent activity, anchors, and a strong `primaryEntry`.
- **A2 Design entry**: Pass. `primaryEntry` is still `mnemonic — key design decisions`, and `suggestedNext` remains a coherent reading path.
- **B1 "Why are embeddings gitignored?"**: Pass with friction. Recall returns provenance-rich results, but the top hit is now `Sync redesign: decouple embedding from git, force flag, remove reindex` rather than the canonical key-design note with the exact gitignored rationale.
- **B2 Temporal recall (non-verbose)**: Pass. `Temporal Interpretation Strategy` ranks first and returns bounded history plus a meaningful single-commit `historySummary`.
- **B3 Verbose temporal**: Pass. `mnemonic — key design decisions` ranks first and returns multi-commit history with useful stats.
- **B4 Cold hybrid recall phrasing**: Pass. In a fresh session, `recall(query="hybrid reranking rescue projections")` returns `Hybrid recall design and implementation (completed 0.20.0)` at rank 1.
- **C1 Relationship follow-up from recent note**: Pass with friction. The most recent note exposes relationships, but the follow-up path is mainly between the reusable prompt and this results note, not back into architecture notes.
- **D1 Warm session**: Pass. `project_memory_summary` stayed structurally stable, and measured latency improved from `763.2ms` cold to `297.3ms` warm in the same session.
- **E1 Theme quality**: Pass. Themes remain meaningful; `other` is present but not dominant.
- **F1 Provenance and confidence**: Pass. Provenance fields are present and confidence levels remain sensible (`high` for anchor notes, `medium` for others).
- **F2 AlwaysLoad via MCP**: Fail. The remember/update cycle works, but `get` no longer surfaces `alwaysLoad`, so the pack's stated verification method (verify via `get`) is stale.
- **G1 Single-commit note history**: Pass. The top B2 result produced `This note was created and has not been modified since.` exactly.
- **G2 Multi-commit note evolution**: Pass. The top B3 result produced a non-generic `historySummary` and non-generic `changeDescription` values.
- **E2E-1 Resume after a week**: Pass. The summary alone is enough to re-orient.
- **E2E-2 Design archaeology**: Pass. `recall(query="projections enrichment layer design")` returns the enrichment-layer design note at the top, and its related notes reach the key design decisions note immediately.
- **E2E-3 Recent-to-architecture navigation**: Fail. Starting from the most recent note does not currently lead back to architecture or decisions notes within 3 steps; it loops inside the dogfooding pair of notes.
- **E2E-4 "What should I read first?"**: Pass with friction. The top result is `Language-Independent Temporal Interpretation` rather than `Temporal Interpretation Strategy`, but the returned cluster is coherent and useful.

### Latest revelations

- The new hybrid recall scenario is worth keeping permanently in the reusable pack. It caught a real regression where lexical reranking depended on an unpopulated projection cache.
- The reusable pack's **F2** step is now stale: `get` does not expose `alwaysLoad`, so the note's frontmatter persistence cannot be verified the way the pack currently instructs.
- The current dogfooding notes are not wired back into durable architecture notes strongly enough, so the recent-to-architecture navigation test now fails even though relationship expansion itself works.

Follow-up: the reusable prompt was updated after this rerun so F2 now verifies `alwaysLoad` by inspecting the note markdown file directly instead of relying on `get` output.

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
- 77 notes in project vault, 0 in main vault for this project

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
- [x] cold hybrid recall reranking works for projection-heavy phrasing

### Phase 4: Relationships

- [x] related notes are useful next steps
- [x] relationship previews are bounded
- [ ] recent notes connect back to durable knowledge

### Phase 5: Active session caching

- [x] repeated calls feel faster
- [x] no stale cache surprises
- [x] mutation invalidation works

### Phase 6: Themes

- [x] themes are meaningful
- [x] "other" is acceptable/refined
- [x] theme emergence looks real
- [x] non-English/mixed notes degrade gracefully

### Phase 7: Roles / importance

- [x] explicit metadata improves prioritization
- [x] inferred roles help without noise
- [ ] alwaysLoad behaves cleanly (current pack step is stale: `get` does not surface `alwaysLoad`)

### Phase 8: Temporal interpretation

- [x] changeDescription is informative — **works in both verbose and non-verbose mode**
- [x] historySummary tells the evolution story — **works in both verbose and non-verbose mode**
- [x] no need for raw diffs in normal workflow

### End-to-end

- [x] resume-after-a-week works
- [x] design archaeology works
- [ ] recent-to-architecture navigation works
- [x] "what should I read first?" works

---

## Overall: **27 / 30 scorecard items passing**

Current branch dogfooding still validates the broader enrichment stack, and the newly added cold hybrid recall scenario passes on the real mnemonic notes. The failures are now mostly workflow-quality issues rather than core recall breakage: one stale pack instruction (`alwaysLoad` verification through `get`) and one graph-quality/navigation issue in the dogfooding note cluster.

Root cause of the previous `[~]` item: stats object was only populated when `verbose: true` in `src/provenance.ts`; classification of `unknown` into `expand`/`refine` depended on stats; non-verbose callers never got reclassification. Fix: always compute stats; strip them from output when not in verbose mode (done in `src/index.ts` post-enrichment).
