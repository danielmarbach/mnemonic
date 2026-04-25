---
title: 'Dogfooding test packs: reusable prompts and scorecards'
tags:
  - dogfooding
  - testing
  - prompt
  - reusable
  - scorecard
lifecycle: permanent
createdAt: '2026-03-28T18:54:38.792Z'
updatedAt: '2026-04-25T21:24:15.658Z'
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
# Dogfooding test packs: reusable prompts and scorecards

Reusable dogfooding packs for validating mnemonic behavior against a released build or current local build. Use the packs selectively: run the broad enrichment/regression pack when validating the core recall/orientation stack, run the working-state continuity pack when validating temporary-note recovery workflow, and run the interruption/resumption pack when validating whether checkpoint notes are actually useful across sessions.

After running a pack, capture results in a new project note with a dated title and the relevant scorecard.

## Deterministic assertions now in integration tests

The following checks from Packs A/B/C were deterministic assertions that belong in CI, not dogfood runs. They have been extracted to `tests/pipeline-smoke.integration.test.ts` and existing integration test files:

| Former dogfood check | Integration test file |
| --- | --- |
| D1 — warm-session stability (`project_memory_summary` identical on two calls) | `pipeline-smoke.integration.test.ts` |
| F2 — alwaysLoad toggle persists via remember/update | `memory-lifecycle.integration.test.ts` |
| Pack A — temporal filter not over-excluding (with `mode: "temporal"`) | `pipeline-smoke.integration.test.ts` + `recall-pipeline.integration.test.ts` |
| W4 — workflow-hint prompt contains orientation guidance | `pipeline-smoke.integration.test.ts` |
| W6 — all-temporary consolidation auto-deletes sources | `memory-lifecycle.integration.test.ts` |
| Pack C — semanticPatch multi-insert, lint warning, retry | `update-sem-patch.integration.test.ts` + `dogfood-semantic-patch.mjs` |

The dogfood runner (`scripts/run-dogfood-packs.mjs`) no longer has a release gate mechanism. It runs Pack A and Pack B quality observations only and reports advisory findings. Pack C is fully covered by integration tests.

## Pack A — Core enrichment and orientation regression pack

This is the evolved version of the original Phases 1–8 validation prompt. The old phase labels are now historical context only; the pack should be treated as a standing regression suite for the current enrichment/orientation stack.

### Pack A executable prompt

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

**E1 — Theme quality:** Count themes from the summary output. How many have only 1 note? Does "other" appear? Are the top 3 themes meaningful? Rate: Pass / Pass with friction / Fail.

**F1 — Provenance and confidence:** From recall results (B1 or B2), inspect provenance: lastUpdatedAt, lastCommitHash, recentlyChanged. Is confidence "high" on anchor notes? "medium" on others? Rate: Pass / Pass with friction / Fail.

**G1 — Single-commit note history:** From temporal results, find a note with 1 commit. Is `historySummary` "This note was created and has not been modified since."? Rate: Pass / Pass with friction / Fail.

**G2 — Multi-commit note evolution:** Find a note with 3+ commits from temporal results. Is `historySummary` informative or generic? Is `changeDescription` for unknown category helpful or just "Updated the note."? Rate: Pass / Pass with friction / Fail.

**E2E-1 — Resume after a week:** From `project_memory_summary` alone (no recall), can you re-orient on current project work? Rate: Pass / Pass with friction / Fail.

**E2E-2 — Design archaeology:** Call `recall` with query="projections enrichment layer design" and cwd. Does top result cover the design? Can you reach the key design decisions note in 2 hops via relationships? Rate: Pass / Pass with friction / Fail.

**E2E-3 — Recent-to-architecture navigation:** Start from the most recent note (from summary). Via `get` + includeRelationships, navigate to an architecture or decisions note. Does the path work in 3 steps or fewer? Rate: Pass / Pass with friction / Fail.

**E2E-4 — "What should I read first?"** Call `recall` with query="what should I read first to understand temporal interpretation" and cwd. Does the right note rank at top? Do its relationships form a coherent cluster? Rate: Pass / Pass with friction / Fail.

**CAPTURE:** Call `remember` with title "Dogfooding results: core enrichment/orientation pack (YYYY-MM-DD)", lifecycle permanent, scope project, tags [dogfooding, testing, scorecard, regression], containing all test results and the completed scorecard.

### Pack A scorecard template

- [ ] cold-start orientation useful
- [ ] design entry path coherent
- [ ] recall answers canonical design questions
- [ ] temporal recall bounded and informative
- [ ] cold hybrid phrasing still works
- [ ] relationship follow-ups useful
- [ ] warm-session behavior stable
- [ ] themes meaningful
- [ ] provenance and confidence sensible
- [ ] alwaysLoad persistence behaves cleanly
- [ ] single-commit history summary correct
- [ ] multi-commit history summary useful
- [ ] resume-after-a-week works
- [ ] design archaeology works
- [ ] recent-to-architecture navigation works
- [ ] "what should I read first?" works

## Pack B — Working-state continuity pack

Use this when validating workflow-hint-first continuity based on temporary notes.

### Pack B executable prompt

Paste this into a new session with cwd set to the mnemonic repo root:

Run a focused dogfooding test of working-state continuity in mnemonic. Use cwd=/path/to/mnemonic for all calls. Capture results in a project note when done.

**SETUP:** Call `detect_project` with cwd. Call `project_memory_summary` first for orientation.

**W1 — Orientation first:** Confirm the summary provides a useful starting point before any recovery step. Rate: Pass / Pass with friction / Fail.

**W2 — Temporary recovery via recall:** Call `recall` with a query targeting active work and `lifecycle="temporary"`. Does it return only temporary notes? Are the results useful for resuming work? Rate: Pass / Pass with friction / Fail.

**W3 — Temporary recovery via recent:** Call `recent_memories` with `lifecycle="temporary"` and confirm it returns only temporary notes. Rate: Pass / Pass with friction / Fail.

**W5 — Lifecycle distinction:** Confirm the guidance still separates `temporary` plans/WIP from `permanent` decisions and durable lessons. Rate: Pass / Pass with friction / Fail.

**W7 — End-to-end resume flow:** Start from summary output, recover temporary notes, choose the right next step, and verify the flow feels like a continuation of project orientation rather than a parallel system. Rate: Pass / Pass with friction / Fail.

**CLEANUP:** Call `forget` on any temporary test notes created only for this run.

**CAPTURE:** Call `remember` with title "Dogfooding results: working-state continuity pack (YYYY-MM-DD)", lifecycle permanent, scope project, tags [dogfooding, testing, scorecard, workflow, temporary-notes], containing all test results and the completed scorecard.

### Pack B scorecard template

- [ ] summary-first orientation still holds
- [ ] `recall(lifecycle: temporary)` is useful
- [ ] `recent_memories(lifecycle: temporary)` is useful
- [ ] lifecycle distinction stays clear
- [ ] end-to-end resume flow feels coherent

## Pack C — Blind interruption and resumption usefulness pack

Use this to test whether checkpoint-style temporary notes actually help an agent or user resume real work across sessions. This pack is about usefulness, not just correctness.

### Pack C executable prompt

This pack must be run in two sessions.

#### Session 1 — capture

1. Start a real task in the mnemonic repo and work on it for 10-20 minutes until there is genuine partial progress, at least one blocker or ambiguity, and a clear next step.
2. Before stopping, create or update a temporary checkpoint note for that task.
3. The checkpoint should include:
   - current status
   - what was attempted
   - what worked
   - blockers or open questions
   - the next immediate action
4. End the session completely.

#### Session 2 — blind resume

Start a fresh session with cwd set to the mnemonic repo root. Do not read old conversation history, git diff, or unstaged files first.

Run a blind resumption test of mnemonic working-state continuity. Use cwd=/path/to/mnemonic for all calls. You may use `project_memory_summary`, `recall`, `recent_memories`, and `get`, but do not inspect previous chat context before trying to resume.

**C1 — Orientation:** Call `project_memory_summary` first. Does it orient you well enough to know what area you are in before recovery? Rate: Pass / Pass with friction / Fail.

**C2 — Recover the right task:** Use `recall(lifecycle="temporary")` or `recent_memories(lifecycle="temporary")`. Does the right checkpoint surface quickly? Rate: Pass / Pass with friction / Fail.

**C3 — Recover the right next action:** From the checkpoint note, can you identify the correct next step without consulting prior chat history? Rate: Pass / Pass with friction / Fail.

**C4 — Recover prior attempts and blockers:** Does the checkpoint preserve enough context to avoid redoing already-failed work or missing known blockers? Rate: Pass / Pass with friction / Fail.

**C5 — Time to useful resumption:** Measure roughly how long it takes from fresh session start to first correct next action. Rate: Pass / Pass with friction / Fail.

**C6 — Wrong turns avoided:** Did the checkpoint reduce re-discovery and prevent obvious dead ends? Rate: Pass / Pass with friction / Fail.

**C7 — No parallel workflow smell:** Does the flow still feel like project orientation first, then continuation, rather than a separate memory system competing with the main workflow? Rate: Pass / Pass with friction / Fail.

**C8 — Cleanup decision:** At the end, should the checkpoint remain temporary, be updated, or be consolidated into a durable note? Record the answer explicitly. Rate: Pass / Pass with friction / Fail.

**CAPTURE:** Call `remember` with title "Dogfooding results: blind interruption/resumption pack (YYYY-MM-DD)", lifecycle permanent, scope project, tags [dogfooding, testing, scorecard, workflow, temporary-notes, continuity], containing all results plus the measured or estimated resumption time.

### Pack C scorecard template

- [ ] orientation still came first
- [ ] the right checkpoint surfaced quickly
- [ ] the next action was recoverable
- [ ] blockers and prior attempts were preserved
- [ ] resumption time felt materially reduced
- [ ] wrong turns were avoided
- [ ] the workflow did not feel parallel or competing
- [ ] checkpoint cleanup/consolidation decision was clear

## Known runs

- 2026-03-28 / 2026-04-04: original core pack runs captured in `dogfooding-test-suite-results-phases-1-8-validation-2026-03--86866b21`.

## Naming guidance

- Use "core enrichment/orientation pack" for the broad regression run.
- Use "working-state continuity pack" for the temporary-note recovery workflow run.
- Use "blind interruption/resumption pack" for the real cross-session usefulness run.
- Avoid the old "Phases 1–8" wording in new result-note titles unless you are explicitly referring to historical runs.
