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
updatedAt: '2026-03-28T18:53:25.240Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
# Dogfooding test suite: Phases 1–8 validation

Run date: 2026-03-28. Version under test: released mnemonic-mcp (updated MCP in session). All tests run against the real `.mnemonic` project vault (73 notes).

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

Friction noted: 20 themes, many are single-note (embedding, detection, mnemonic, mode, npm, principles, support, vaultrouting, workflow). These add noise without much signal. "other" is not used — instead many tiny theme buckets appear. This dilutes the theme section.

### A2 — "Where should I start to understand the design?" — Pass with friction

- `primaryEntry` (`mnemonic — key design decisions`) is the right answer — centrality 8, explains overview note, related to git protocol, performance principles
- Relationships shown on primaryEntry (3/8 truncated): git commit protocol, performance principles, project overview — all useful
- `suggestedNext[0]` = GitHub Packages CI workflow — not the best next step for a design reader; architecture notes like `enrichment-layer-design` or `mnemonic-source-file-layout` would serve better
- `suggestedNext[2]` = project overview — good fallback

Friction: suggestedNext ordering is centrality-driven, not query-adapted. A design-focused reader would prefer architecture notes over CI notes as second entry.

---

## Test Pack B: Recall quality

### B1 — "Why are embeddings gitignored?" — Pass

- Top result: `Sync redesign: decouple embedding from git` (boosted 0.80) — directly relevant
- Result 2: `Embedding lazy backfill and staleness detection` — relevant
- Result 3: `Design principle: git commits must only touch mnemonic-managed files` — less directly relevant but connected
- The actual answer is IN `mnemonic — key design decisions` (not top-ranked here) — it appears in later recalls but not top-5 for this query. The sync-redesign note covers the rationale sufficiently though.
- Provenance shown on all results ✓, confidence "medium" on all ✓

### B2 — Temporal recall on "temporal interpretation design decisions" — Pass

- Top 5 results all directly relevant: temporal interpretation strategy, language-independent temporal interpretation, enrichment layer design, MCP workflow UX, role heuristics
- `history` entries present on all results with `changeCategory`, `changeDescription`, `historySummary` ✓
- `historySummary` for new notes: "This note was created and has not been modified since." — clear and accurate
- `historySummary` for enrichment layer (3 commits): "This note has been updated several times." — correct but terse; could name the evolution arc
- `changeDescription` examples: "Created this note." / "Updated the note." — functional but generic for multi-commit notes
- Temporal output is bounded: top matches only, commit summaries compact ✓
- No raw diffs ✓

Friction: `changeDescription` for `unknown` category is generic ("Updated the note.") — doesn't explain what kind of update. The enrichment layer note was expanded with Phase 5 caching and then Phase 8 temporal content — those are meaningful evolution steps lost to "unknown".

### B3 — Verbose temporal on "mnemonic key design decisions" — Pass with friction

- Top match was NOT `mnemonic-key-design-decisions` itself — instead returned role-suggestion notes (0.79 boosted). The canonical design decisions note seems to have lower embedding relevance to this query phrasing.
- Stats context shown with verbose: `+1814/-96 lines, 24 files changed` — useful size signal
- `changeCategory: "create"` for notes created in a large batch commit — technically correct but loses nuance (those notes were actually curated consolidations)

Friction: The main design decisions note (`mnemonic-key-design-decisions-3f2a6273`) not ranking at top for "mnemonic key design decisions" query is a mild relevance miss — projection quality may affect this.

---

## Test Pack C: Relationship follow-up

### C1 — Follow relationships from recent note — Pass

Starting from `enrichment-layer-design` (most recent substantial note):

- `get` with `includeRelationships: true` returned 4 relations, 3 shown (truncated)
- Shown: active-session-cache (architecture), role-suggestions (decisions/explains), roles-are-hints (decisions)
- Each relationship includes theme, relationType, confidence — useful context ✓
- `explains` vs `related-to` distinction visible and meaningful ✓
- Path: recent enrichment design → role suggestions (explains) → back to enrichment design (circular) — truncation prevents runaway

Good: the recent note correctly connects to the cache note (Phase 5) and role notes (Phase 7) which forms the right cross-phase context path.

---

## Test Pack D: Warm session (Phase 5 cache)

### D1 — Repeated project_memory_summary — Pass

Second call returned identical structure to cold call (same notes, themes, anchors, orientations). No stale cache surprises, no dropped results. Response was subjectively fast.

Could not independently time cache benefit in this session — latency feel similar. The structural consistency (no mutation between calls) confirms no invalidation noise.

---

## Test Pack E: Theme quality (Phase 6)

### E1 — Theme inspection — Pass with friction

- Major themes: `decisions` (29), `tooling` (15), `architecture` (8) — correct and meaningful grouping
- Medium themes: `bugs` (3), `ci` (2), `testing` (2) — fine
- Single-note micro-themes (15 of them): `agent`, `consolidate`, `create`, `design`, `detection`, `embedding`, `mnemonic`, `mode`, `npm`, `overview`, `principles`, `support`, `vaultrouting`, `workflow` — these feel like tag bleed rather than emergent themes
- `other` is absent — system classifies everything into some bucket, even if bucket has 1 note

Friction: 20 themes for 73 notes means many thin themes. An ideal summary would collapse or suppress single-note themes. This makes the theme section harder to scan quickly.

---

## Test Pack F: Phase 7 — Roles / importance

### F1 — Provenance and confidence on recall results — Pass

- Every recall result includes `provenance` (lastUpdatedAt, lastCommitHash, lastCommitMessage, recentlyChanged) ✓
- `confidence` values: "medium" on almost all results — `primaryEntry` in summary shows "high" (centrality 8, permanent, recent) ✓
- `recentlyChanged: true` correctly set on notes from today's PR (2026-03-28) ✓
- Freshness easy to judge from provenance ✓

### F2 — alwaysLoad behavior — Not tested

No explicit `alwaysLoad` metadata seen in notes during this run. `primaryEntry` and `suggestedNext` in summary serve a similar orientation role. Could not validate alwaysLoad-specific path without a note explicitly using it.

---

## Test Pack G: Phase 8 — Temporal interpretation

### G1 — "Temporal Interpretation Strategy" note history — Pass

- Single commit: create, `changeDescription: "Created this note."`, `historySummary: "This note was created and has not been modified since."` — accurate ✓
- Relationship to `why-default-temporal-mode-avoids-raw-diffs` shown inline ✓

### G2 — Enrichment layer evolution — Pass with friction

Note has 3 commits (create → Phase 5 update → Phase 8 update).

- `historySummary: "This note has been updated several times."` — correct but doesn't name phases
- `changeCategory: "unknown"` for the two update commits — structural signals insufficient to classify
- `changeDescription: "Updated the note."` — generic

What good looks like: "Expanded with Phase 5 session caching content, then further expanded with Phase 8 temporal interpretation design." The system can't infer this from diff stats alone — acceptable given the no-raw-diffs constraint.

---

## End-to-end scenarios

### E2E-1 — Resume after a week — Pass

`project_memory_summary` immediately surfaces: 73 notes, themes, recent notes (Phase 8 temporal work), primary anchor (key design decisions). Enough to re-orient without additional `recall` calls for well-known topics.

### E2E-2 — Design archaeology — Pass

`recall "projections enrichment layer design"` → top result `enrichment-layer-design` (0.86 boosted) with all 4 phase coverage in note body → relationships connect to cache, role notes → full architecture graph reachable in 2 hops.

### E2E-3 — Recent-to-architecture navigation — Pass

Recent notes (temporal interpretation) → `get` with relationships → `explains` link to `enrichment-layer-design` → `related-to` link to key design decisions anchor. Path works naturally in 3 steps.

### E2E-4 — "What should I read first?" — Pass with friction

For temporal interpretation: `recall "what should I read first to understand temporal interpretation"` correctly returns `Temporal Interpretation Strategy` (0.77) as top hit, followed by `Why Default Temporal Mode Avoids Raw Diffs` and `Language-Independent Temporal Interpretation`. Relationships form a coherent cluster. Good.

For "design" in general: `primaryEntry` = key design decisions is correct but requires the user to know to look at `suggestedNext` for depth; the path isn't explicit.

---

## Compact scorecard

### Phase 1: Provenance + confidence

- [x] provenance useful — commit hash, message, lastUpdatedAt, recentlyChanged all present
- [x] confidence sensible — high for anchor, medium elsewhere; consistent
- [x] freshness easy to judge — recentlyChanged flag works well

### Phase 2: Temporal recall

- [x] temporal mode useful — surfaces correct history for phase-8 notes
- [x] output bounded — top N notes, top N commits, compact summaries
- [x] history retrieval reliable — all tested notes returned history

### Phase 3: Projections

- [x] previews feel concise and useful — relationship previews show title/theme/type
- [x] recall quality preserved — semantic ranking not degraded
- [ ] projection-based embedding input — "mnemonic key design decisions" query didn't rank the canonical note at top; possible projection drift (note is from 2026-03-22, last embedded at prune time)

### Phase 4: Relationships

- [x] related notes are useful next steps — enrichment → cache → roles chain is coherent
- [x] relationship previews bounded — max 3 shown, truncated flag present
- [x] recent notes connect to durable knowledge — temporal interpretation → enrichment design → key decisions

### Phase 5: Active session caching

- [x] repeated calls feel fast
- [x] no stale cache surprises — second summary identical to first
- [ ] mutation invalidation — not tested (no writes performed before second summary call)

### Phase 6: Themes

- [x] themes are meaningful — top buckets (decisions, tooling, architecture) are accurate
- [ ] "other" is acceptable/refined — "other" absent; instead 15 single-note micro-themes pollute the listing
- [ ] theme emergence looks real — only partially; tail themes are tag-bleed artifacts
- [x] non-English/mixed notes degrade gracefully — not tested (no non-English notes in vault)

### Phase 7: Roles / importance

- [x] explicit metadata improves prioritization — confidence "high" on well-connected permanent notes
- [x] inferred roles help without noise — role hints don't appear in output directly, only provenance/confidence visible
- [ ] alwaysLoad behaves cleanly — not tested (no alwaysLoad notes in vault)

### Phase 8: Temporal interpretation

- [x] changeDescription is informative — for single-commit creates, "Created this note." is clear
- [ ] historySummary tells the evolution story — generic for multi-commit notes ("updated several times"), doesn't describe the arc
- [x] no need for raw diffs in normal workflow — bounded summaries sufficient for most orientation tasks

### End-to-end

- [x] resume-after-a-week works
- [x] design archaeology works
- [x] recent-to-architecture navigation works
- [x] "what should I read first?" works (with minor friction on general design queries)

---

## Overall: 22 / 28 scorecard items passing

Key friction points to investigate:

1. Single-note micro-themes dilute the theme section — consider a minimum-note threshold or collapsing tail into "other"
2. `historySummary` for multi-commit notes is generic — "updated several times" loses arc information
3. `changeDescription` defaults to "Updated the note." for `unknown` category — even size-based description ("Substantially expanded") would be more useful
4. `suggestedNext` in summary is centrality-ordered, not query-intent-aware — CI workflow appearing first for design-oriented readers is suboptimal
5. Canonical design decisions note didn't top-rank for its own title query — projection staleness may be a factor
