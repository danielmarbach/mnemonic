---
title: 'Dogfooding results: core enrichment/orientation pack (2026-04-17)'
tags:
  - dogfooding
  - testing
  - scorecard
  - regression
lifecycle: permanent
createdAt: '2026-04-17T13:25:35.890Z'
updatedAt: '2026-04-17T13:38:42.590Z'
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
## Pack A — Core enrichment and orientation regression (2026-04-17)

Mnemonic v0.23.0, run against local build (`build/index.js`) with real project vault (80 notes + 40 main-vault notes).

Automated runner: `scripts/dogfood-pack-a.ts` — spawns local MCP server via stdio, exercises all Pack A tests.

### Pack A results

- A1 Cold start: **Pass** — 11 themes visible, orientation present
- A2 Design entry path: **Pass** — primaryEntry present, suggestedNext present
- B1 Embeddings gitignored: **Pass with friction** — Top result is sync redesign (semantic match on embedding/git topic), not the key design decisions note where the explicit "gitignored" rationale lives. Recoverable from top 2 hits. Provenance fields present in structuredContent but not rendered in top-result text output.
- B2 Temporal recall: **Pass** — history present, summary meaningful, no raw diffs
- B3 Verbose temporal: **Pass** — Key design decisions ranked top, verbose stats present (file change counts)
- B4 Cold hybrid phrasing: **Pass** — Hybrid recall design note ranks first despite projection-heavy phrasing (fresh session, cold projections)
- C1 Relationship follow-up: **Pass with friction** — Script couldn't extract recent note ID from summary text automatically, but manual inspection confirms relationships are useful.
- D1 Warm session: **Pass** — Same structure, no dropped results, cache hits visible
- E1 Theme quality: **Pass** — Top themes meaningful, "Other" bucket not overflowing
- F1 Provenance and confidence: **Pass** — Provenance present in recall, confidence in summary
- F2 AlwaysLoad toggle: **Pass** — alwaysLoad true after remember, false after update (verified by reading frontmatter directly)
- G1 Single-commit history: **Pass** — "Created this note" pattern found
- G2 Multi-commit history: **Pass** — Multi-commit patterns informative
- E2E-1 Resume after a week: **Pass** — Summary sufficient for re-orientation
- E2E-2 Design archaeology: **Pass** — Enrichment layer design at top, key decisions reachable
- E2E-3 Recent-to-architecture: **Pass with friction** — same ID extraction issue as C1
- E2E-4 What should I read first: **Pass** — Temporal interpretation at top

### Pack A scorecard

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
- [x] "what should I read first?" works

### Pack A timing (local build, stdio)

- Cold `project_memory_summary`: ~335-440ms (cache miss, builds both vaults)
- Warm `project_memory_summary`: ~300ms (cache hit)
- Cold recall (first query, backfill embeddings): ~622ms
- Warm recall: ~300-460ms
- B4 fresh-session cold recall: ~374ms

### Pack A friction notes

- B1: The "why are embeddings gitignored" query hits sync redesign (0.651) first rather than key design decisions where the explicit rationale lives. Provenance is in structuredContent but not always in the text rendering of non-temporal recall results. Consider whether the text output for recall should include a compact provenance line.
- C1/E2E-3: The summary's recent section format makes automated ID extraction fragile. This is a script robustness issue, not a mnemonic behavior issue.

---

## Pack B — Working-state continuity (2026-04-17)

Run against current v0.23.0 build (no code changes between in-process and local build). Manual inspection of tool behavior and workflow hint content.

### Pack B results

- W1 Orientation first: **Pass** — Summary provides useful starting point (confirmed in Pack A)
- W2 Temporary recovery via recall: **Pass** — No project temporary notes exist currently; correct empty result. Cross-project temporary in main-vault correctly excluded from project-scoped recall.
- W3 Temporary recovery via recent: **Pass** — Only returns main-vault temporary from different project; no false positives
- W4 Guidance alignment: **Pass** — Workflow hint: "project_memory_summary first (do not skip to recovery)", "let lifecycle defaults delete temporary scaffolding"
- W5 Lifecycle distinction: **Pass** — Clear separation: temporary = plans/WIP/drafts; permanent = decisions/constraints/lessons
- W6 Consolidation behavior: **Pass** — No push toward preserving temporary scaffolding by default
- W7 End-to-end resume flow: **Pass** — Summary → (no temporaries) → continue. Flow feels coherent, not parallel.

### Pack B scorecard

- [x] summary-first orientation still holds
- [x] recall(lifecycle: temporary) is useful
- [x] recent_memories(lifecycle: temporary) is useful
- [x] workflow hint matches the design
- [x] lifecycle distinction stays clear
- [x] temporary scaffolding is not preserved by default
- [x] end-to-end resume flow feels coherent

### Pack B notes

- No active temporary checkpoints existed in the mnemonic project vault during this run. The "useful" rating for W2/W3 is based on correct behavior (empty when nothing to recover, no cross-project leakage) rather than actual recovery utility.
- Pack C (blind interruption/resumption) was not executed — it requires a two-session split which cannot be done in a single dogfooding session.
