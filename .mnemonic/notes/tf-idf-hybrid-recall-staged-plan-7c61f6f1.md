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
updatedAt: '2026-04-16T19:36:22.485Z'
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

## Current baseline

The current shipped implementation already has three lexical signals:

- `computeLexicalScore()` in `src/lexical.ts`
- rare-token coverage in `src/recall.ts`
- significant-phrase coverage in `src/recall.ts`

The current test seam is also already in place:

- unit tests: `tests/lexical.unit.test.ts`
- reranking and rescue integration tests: `tests/recall-embeddings.integration.test.ts`
- hybrid selection logic: `src/recall.ts`

This experiment should extend that seam rather than inventing a parallel retrieval subsystem.

## Phase 1 checkpoints — Rescue-only TF-IDF

### Checkpoint 1: Freeze the current baseline behavior

Files to inspect or extend:

- `src/lexical.ts`
- `src/recall.ts`
- `tests/lexical.unit.test.ts`
- `tests/recall-embeddings.integration.test.ts`

Actions:

- document the current rescue trigger, result limits, and ranking signals in the note or PR description
- add any missing baseline regression tests before changing behavior
- explicitly cover these baseline cases:
  - semantic paraphrase still wins when lexical overlap is weak
  - exact lexical query finds the intended note
  - rescue does not promote first-seen weak matches over stronger lexical matches
  - project-first widening still beats equally plausible global matches

Success condition:

- current behavior is locked down tightly enough that TF-IDF changes can be judged against it instead of against memory or intuition

### Checkpoint 2: Add isolated TF-IDF primitives in `src/lexical.ts`

Primary file:

- `src/lexical.ts`

Test file:

- `tests/lexical.unit.test.ts`

Actions:

- add pure helpers for TF calculation, IDF calculation, query/document vector construction, and similarity scoring
- keep normalization and tokenization aligned with the existing lexical path unless tests show a clear reason to diverge
- keep the API small and request-local; avoid persistence, file writes, or hidden caches

Tests to add:

- deterministic TF values for repeated tokens
- deterministic IDF values for rare vs common terms
- deterministic ranking for a small fixed corpus
- empty and degenerate corpus behavior
- rare token queries outrank broad fuzzy matches

Success condition:

- TF-IDF math is testable, deterministic, and independent from recall orchestration

### Checkpoint 3: Build request-scoped TF-IDF rescue candidates

Primary files:

- `src/lexical.ts`
- `src/recall.ts`
- `src/index.ts` only if rescue orchestration currently requires it

Actions:

- build TF-IDF input only from projection text or the exact derived text already used by the lexical lane
- limit candidate generation to the existing rescue situation: weak or absent semantic results
- produce a bounded candidate set suitable for the existing rescue limits
- fail soft to the current rescue behavior when TF-IDF inputs are unavailable or scoring fails

Tests to add:

- weak semantic query activates TF-IDF rescue
- strong semantic query does not route through TF-IDF rescue
- TF-IDF rescue favors exact identifier and repo-jargon matches
- no projections or partial projection availability degrades cleanly

Success condition:

- TF-IDF can replace or narrow the current rescue candidate selection without changing the non-rescue path

### Checkpoint 4: Verify Phase 1 quality against explicit scenarios

Primary files:

- `tests/recall-embeddings.integration.test.ts`
- any fixture helpers needed by those tests

Scenarios to encode:

- semantic paraphrase remains dominant
- exact repo jargon improves
- note-title and identifier lookup improves
- project-local note still wins over global fallback when both match
- weak semantic queries gain plausible rescue candidates
- cold MCP entrypoint still works with no pre-warm step

Success condition:

- the test suite demonstrates clear improvement for lexical-heavy cases with no visible semantic-first regression

### Checkpoint 5: Measure Phase 1 cost before proceeding

Likely files:

- existing tests plus a lightweight benchmark-style test if needed

Actions:

- compare current rescue vs TF-IDF rescue on a larger synthetic or fixture corpus
- record build-time cost, query-time cost, and whether memory overhead is still modest
- capture whether the result feels like a helper layer rather than an indexing subsystem

Go / no-go rule:

- proceed to Phase 2 only if lexical-heavy quality clearly improves and the runtime cost remains acceptable

## Phase 2 checkpoints — Candidate generation TF-IDF

### Checkpoint 6: Limit TF-IDF to lexical candidate narrowing

Primary files:

- `src/recall.ts`
- `src/lexical.ts`

Actions:

- keep semantic recall and semantic ordering exactly as they are
- use TF-IDF only to narrow or prioritize lexical candidates before final hybrid scoring
- do not let TF-IDF become the top-level ranker for strong semantic queries

Success condition:

- the ranking story stays explainable: semantic first, lexical assists, project bias preserved

### Checkpoint 7: Add large-corpus comparison coverage

Likely files:

- `tests/recall-embeddings.integration.test.ts`
- new benchmark-style test file only if the existing integration suite becomes too noisy

Scenarios to encode:

- larger mixed corpus with project and global notes
- mixed semantic and lexical query set
- synonym-heavy queries with low exact-token overlap
- project-plus-global blend where a useful global note should still appear after project-local hits

Success condition:

- TF-IDF candidate narrowing is equal or better than both the current design and rescue-only TF-IDF on relevance, while reducing lexical work or staying latency-neutral

### Checkpoint 8: Decide final outcome and consolidate correctly

Possible outcomes:

- keep the current shipped design and discard the experiment
- keep rescue-only TF-IDF and stop there
- adopt candidate-generation TF-IDF

Memory handling after decision:

- if rejected, keep this note temporary and record the outcome in a durable design/result note
- if rescue-only is adopted, create or update a permanent note describing the production design and supersede the temporary planning note
- if candidate-generation is adopted, update the durable hybrid recall design memory or create a new canonical successor, then supersede this temporary planning note

## Non-goals

Do not add any of the following during the experiment:

- persistent TF-IDF indexes
- committed derived artifacts
- background workers or always-on services
- raw-markdown lexical indexing independent from projections
- user-facing configuration surface before retrieval value is proven

## Review points to consolidate with you

These are the places where I would stop and confirm direction instead of silently pushing forward:

1. After baseline tests are frozen, to confirm the comparison corpus is representative enough.
2. After TF-IDF primitives are implemented, to confirm the weighting and tokenization choices are acceptable.
3. After Phase 1 verification, to decide stop vs proceed.
4. After any Phase 2 large-corpus comparison, to decide keep current, rescue-only, or candidate-generation.

## Current status

This note is intentionally temporary. It is execution scaffolding for the experiment, not a durable architectural decision by itself.
