---
title: TF-IDF hybrid recall staged plan
tags:
  - recall
  - hybrid-search
  - plan
  - implementation
  - projections
lifecycle: temporary
createdAt: '2026-04-16T19:32:34.302Z'
updatedAt: '2026-04-16T21:01:14.251Z'
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: tf-idf-hybrid-recall-experiment-design-e33e51cf
    type: explains
memoryVersion: 1
---
Temporary execution plan for evaluating TF-IDF inside mnemonic's hybrid recall path without changing the current semantic-first architecture.

## Goal

Determine whether TF-IDF improves lexical-heavy recall enough to keep, while preserving these invariants:

- semantic retrieval remains primary
- project-first widening remains unchanged
- all TF-IDF state is derived and disposable
- local MCP startup and usage require no extra steps
- language-independence does not regress as a side effect of stronger lexical scoring

## Current implementation status

Implemented so far:

- baseline semantic paraphrase safety integration coverage was added
- explicit repo-jargon rescue coverage was added
- explicit stronger-non-English semantic guardrail coverage was added
- pure TF-IDF helpers were added in `src/lexical.ts`
- lexical rescue candidate collection now ranks the whole eligible rescue pool with TF-IDF before applying the bounded rescue limit
- late-candidate rescue coverage now verifies that a stronger lexical match can still win even when it appears after many weaker decoys
- a synthetic comparison harness now measures the previous bounded lexical rescue path against the TF-IDF rescue path
- a more realistic note-shaped comparison harness now measures tradeoffs on mixed design, checkpoint, temporal, dogfooding, and misc note patterns
- the TF-IDF ranker was optimized to reuse prepared corpus tokenization and IDF data instead of rebuilding them repeatedly during ranking
- the TF-IDF ranker now includes a small title-aware lexical boost so exact title matches can beat repeated generic design decoys in realistic note-shaped corpora
- real-note dogfooding runs for Pack A and Pack B completed against the live project notes and did not reveal a new regression attributable to the TF-IDF experiment
- the main dogfooding noise source was live-vault recency pollution rather than the TF-IDF rescue behavior itself
- **isolated dogfood vault runner is now implemented** — `run-dogfood-packs.mjs --isolated` copies notes into a temporary workspace, runs packs there, and cleans up afterward, removing the live-vault noise problem for future dogfooding runs

Implemented files:

- `src/lexical.ts`
- `src/index.ts`
- `tests/lexical.unit.test.ts`
- `tests/lexical-rescue-comparison.unit.test.ts`
- `tests/recall-embeddings.integration.test.ts`
- `scripts/dogfooding-isolated-vault.mjs` (new)
- `scripts/dogfooding-runner-helpers.mjs` (modified)
- `scripts/run-dogfood-packs.mjs` (modified)
- `tests/dogfooding-isolated-vault.unit.test.ts` (new)
- `tests/dogfooding-runner.unit.test.ts` (modified)
- `tests/dogfooding-runner.integration.test.ts` (new)

Verified command and result:

- `npm test -- tests/lexical.unit.test.ts tests/lexical-rescue-comparison.unit.test.ts tests/recall.unit.test.ts tests/recall-embeddings.integration.test.ts`
- result: 4 files passed, 75 tests passed, 0 failed
- `npm test` (full suite): 42 files passed, 622 tests passed, 0 failed

## Dogfooding snapshot

Real-note dogfooding results captured on 2026-04-16:

- `dogfooding-results-core-enrichment-orientation-pack-2026-04--8ee44ddb`
- `dogfooding-results-working-state-continuity-pack-2026-04-16-9217df0e`
- `dogfooding-results-blind-interruption-resumption-pack-2026-0-42f05f1a`

High-level reading:

- Pack A was mostly pass with friction, not fail. Cold hybrid phrasing still worked on the real notes, temporal recall stayed bounded, and design archaeology still worked.
- Pack B passed with friction. Temporary-note recovery remained useful and coherent.
- Pack C was only a closest honest approximation because a truly blind second-session run was not available from the current session.
- The main workflow noise was still live-vault contamination of recent-note navigation, matching the existing isolated-dogfood-runner checkpoint, rather than a regression caused by TF-IDF rescue.

**Updated 2026-04-16:** The isolated dogfood vault runner is now available (`run-dogfood-packs.mjs --isolated`). Future dogfooding runs can use it to eliminate live-vault recency noise, which was the dominant measurement-quality problem identified in the 2026-04-16 dogfooding runs.

Interpretation:

- Real-note dogfooding did not produce evidence that the current rescue-only TF-IDF work regressed the user-facing recall/orientation workflow.
- The strongest remaining measurement-quality problem was environmental: live-vault dogfooding makes recent-note and relationship-navigation judgments noisy. This is now solvable with the `--isolated` flag.

## Measurement snapshot

### Synthetic late-target corpus

Before the prepared-corpus optimization, the observed synthetic measurement was:

- previous bounded lexical rescue rare-term MRR: `0.400`
- TF-IDF rescue rare-term MRR: `0.607`
- previous bounded lexical rescue broad-query MRR: `1.000`
- TF-IDF rescue broad-query MRR: `1.000`
- previous bounded lexical rescue measurement time: about `9.5ms`
- TF-IDF rescue measurement time: about `155.7ms`

After the prepared-corpus optimization, a direct measurement run produced:

- previous bounded lexical rescue rare-term MRR: `0.400`
- TF-IDF rescue rare-term MRR: `0.607`
- previous bounded lexical rescue broad-query MRR: `1.000`
- TF-IDF rescue broad-query MRR: `1.000`
- previous bounded lexical rescue measurement time: about `9.2ms`
- TF-IDF rescue measurement time: about `5.8ms`

After title-aware tuning, a direct measurement run produced:

- previous bounded lexical rescue rare-term MRR: `0.400`
- TF-IDF rescue rare-term MRR: `0.607`
- previous bounded lexical rescue broad-query MRR: `1.000`
- TF-IDF rescue broad-query MRR: `1.000`
- previous bounded lexical rescue measurement time: about `9.1ms`
- TF-IDF rescue measurement time: about `15.8ms`

### More realistic note-shaped corpus

Before the prepared-corpus optimization, the observed realistic-corpus measurement was:

- previous bounded lexical rescue rare-term MRR: `1.000`
- TF-IDF rescue rare-term MRR: `1.000`
- previous bounded lexical rescue broad-query MRR: `1.000`
- TF-IDF rescue broad-query MRR: `0.676`
- previous bounded lexical rescue measurement time: about `13.2ms`
- TF-IDF rescue measurement time: about `237.1ms`

After the prepared-corpus optimization, a direct measurement run produced:

- previous bounded lexical rescue rare-term MRR: `1.000`
- TF-IDF rescue rare-term MRR: `1.000`
- previous bounded lexical rescue broad-query MRR: `1.000`
- TF-IDF rescue broad-query MRR: `0.676`
- previous bounded lexical rescue measurement time: about `13.5ms`
- TF-IDF rescue measurement time: about `6.3ms`

After title-aware tuning, a direct measurement run produced:

- previous bounded lexical rescue rare-term MRR: `1.000`
- TF-IDF rescue rare-term MRR: `1.000`
- previous bounded lexical rescue broad-query MRR: `1.000`
- TF-IDF rescue broad-query MRR: `1.000`
- previous bounded lexical rescue measurement time: about `13.3ms`
- TF-IDF rescue measurement time: about `10.1ms`

Interpretation:

- the title-aware tuning removed the broad-query regression on the realistic note-shaped corpus used in the current harness
- on this realistic harness, TF-IDF is now quality-neutral relative to the previous bounded lexical rescue path while remaining in the same rough timing range
- the current evidence is materially better than before, and the dogfooding runs did not contradict the harness story

## Current state in plain terms

- the baseline and guardrail coverage for Phase 1 is in good shape
- the rescue-only TF-IDF shortlist behavior is implemented
- the earlier timing concern was mostly removed by avoiding repeated corpus preparation work
- the realistic note-shaped ranking regression was addressed by adding a small title-aware boost
- real-note dogfooding did not reveal a new regression attributable to the TF-IDF experiment
- the isolated dogfood vault runner is now implemented, removing the main measurement-quality obstacle for future dogfooding runs
- **next action:** re-run Pack A using `run-dogfood-packs.mjs --isolated` to get clean recency/relationship-navigation measurements without live-vault noise, then decide keep/proceed
