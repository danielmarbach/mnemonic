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
updatedAt: '2026-04-16T19:58:30.409Z'
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
- pure TF-IDF helpers were added in `src/lexical.ts`
- lexical rescue candidate collection now ranks the whole eligible rescue pool with TF-IDF before applying the bounded rescue limit
- targeted lexical and recall-focused verification passed after the change

Implemented files:

- `src/lexical.ts`
- `src/index.ts`
- `tests/lexical.unit.test.ts`
- `tests/recall-embeddings.integration.test.ts`

Verified command and result:

- `npm test -- tests/lexical.unit.test.ts tests/recall.unit.test.ts tests/recall-embeddings.integration.test.ts`
- result: 3 files passed, 69 tests passed, 0 failed

## Language-independence reference

Reference design note:

- `mnemonic-language-independent-role-heuristics-f66619c1`

Relevant principles to carry over into this experiment:

- wording-based signals may help, but they must remain supplementary rather than primary
- unsupported-language notes should behave similarly to cue-word variants when the underlying semantic match is equally strong
- tuning should not optimize only for mnemonic's own English-heavy vocabulary

This does not mean TF-IDF must become language-neutral. It means the experiment must verify that stronger lexical scoring does not create avoidable English-only regressions in the user-facing retrieval contract.

## Phase 1 checkpoints — Rescue-only TF-IDF

### Checkpoint 1: Freeze the current baseline behavior

Status: partially complete.

Completed baseline coverage:

- semantic paraphrase safety
- exact lexical tie-break coverage remains present from the existing cold-projection reranking test
- weak semantic rescue quality remains present from the existing rescue ranking test

Still to add for a fuller baseline matrix:

- explicit identifier and repo-jargon lookup regression case
- explicit cross-language sanity integration case
- explicit cold-start operational simplicity assertion for TF-IDF-aware recall behavior if the existing MCP integration coverage is judged insufficient

Files to inspect or extend:

- `src/lexical.ts`
- `src/recall.ts`
- `tests/lexical.unit.test.ts`
- `tests/recall-embeddings.integration.test.ts`
- `tests/recall.unit.test.ts` if project-bias assertions fit better there

Baseline matrix to lock down before broader TF-IDF changes:

1. Semantic paraphrase safety

- target file: `tests/recall-embeddings.integration.test.ts`
- status: implemented
- test name: `it("keeps semantic paraphrase matches ahead when lexical overlap is weak", async () => { ... })`

1. Exact lexical title match

- target file: `tests/recall-embeddings.integration.test.ts`
- status: already covered by existing reranking test
- existing nearby coverage: `reranks semantic ties using projections even when no projection cache is warm`

1. Identifier and repo-jargon lookup

- target file: `tests/recall-embeddings.integration.test.ts`
- status: not yet added as an explicit regression test
- proposed test name: `it("rescues rare repo-jargon queries with the strongest lexical match", async () => { ... })`

1. Weak semantic rescue quality

- target file: `tests/recall-embeddings.integration.test.ts`
- status: covered by existing rescue test and strengthened by late-candidate coverage
- existing nearby coverage: `lexical rescue keeps the strongest projection matches instead of first-seen notes`
- added coverage: `it("lexical rescue still finds the strongest late candidate beyond the initial rescue scan window", async () => { ... })`

1. Project-first widening invariants

- target file: `tests/recall.unit.test.ts`
- status: already covered by existing selection tests

1. Cold-start operational simplicity

- target file: `tests/recall-embeddings.integration.test.ts` or MCP smoke coverage using `tests/helpers/mcp.ts`
- status: partially covered by existing MCP integration style, but not yet called out with a TF-IDF-specific assertion

1. Cross-language sanity check

- target file: `tests/recall-embeddings.integration.test.ts`
- status: not yet implemented
- proposed test name: `it("does not let lexical boosts displace an equally strong non-English semantic match", async () => { ... })`

Success condition:

- current behavior is locked down tightly enough that further TF-IDF changes can be judged against a fixed matrix instead of memory or intuition
- at least one explicit baseline test exists for each of the seven categories above

### Checkpoint 2: Add isolated TF-IDF primitives in `src/lexical.ts`

Status: substantially complete.

Implemented helpers:

- `computeTermFrequency`
- `computeInverseDocumentFrequency`
- `computeTfIdfCosineSimilarity`
- `rankDocumentsByTfIdf`

Implemented unit coverage:

- normalized term frequency for repeated tokens
- inverse-document frequency weighting for rare terms
- rare-token ranking over broader fuzzy matches
- preservation of non-English tokens during TF-IDF preparation
- strongest late-match selection from a larger corpus slice

Remaining follow-up:

- extend only if later measurement or candidate-generation work needs additional helper boundaries

### Checkpoint 3: Build request-scoped TF-IDF rescue candidates

Status: partially complete and functional.

Implemented behavior:

- build a rescue pool from the full eligible note set after scope and tag filtering
- rank the pool with TF-IDF before applying `LEXICAL_RESCUE_CANDIDATE_LIMIT`
- preserve bounded final rescue results with existing hybrid-score sorting
- keep lexical thresholding and fail-soft behavior in place

Current implementation shape:

- TF-IDF is now used to shortlist rescue candidates across the whole eligible pool rather than stopping at the first qualifying notes in file order
- current final rescue lexical score is `max(computeLexicalScore(...), tfIdfScore)` for shortlisted candidates

Still to evaluate:

- whether this lexical-score combination is the right long-term Phase 1 choice or just an acceptable prototype step
- whether repo-jargon and identifier-heavy cases improve enough in practice
- whether a cross-language sanity case still passes cleanly

### Checkpoint 4: Verify Phase 1 quality against explicit scenarios

Status: in progress.

Verified so far:

- semantic paraphrase remains dominant in the added baseline integration test
- lexical rescue still surfaces strongest late candidates after TF-IDF shortlist ranking
- lexical and recall-focused suites pass after the rescue-path change

Still to verify explicitly:

- identifier and repo-jargon gains
- cross-language semantic correctness guardrail
- whether a dedicated cold-start TF-IDF-aware MCP assertion is needed beyond current integration coverage

Candidate scenario-to-test mapping:

- paraphrase safety: implemented
- exact lexical tie-break: existing coverage remains
- rescue quality: existing coverage plus late-candidate regression remains
- repo jargon gain: still to add
- cold-start simplicity: may need explicit targeted assertion
- cross-language sanity: still to add

Success condition:

- the test suite demonstrates clear improvement for lexical-heavy cases with no visible semantic-first regression and no obvious language-independence regression

### Checkpoint 5: Measure Phase 1 cost before proceeding

Status: not started.

Still needed:

- compare current rescue vs TF-IDF rescue on a larger synthetic or fixture corpus
- record build-time cost, query-time cost, and memory overhead
- include at least a small mixed-language fixture slice so English-only tuning artifacts are easier to spot

Go / no-go rule:

- proceed to Phase 2 only if lexical-heavy quality clearly improves, runtime cost remains acceptable, and no meaningful language-independence regression appears

## Phase 2 checkpoints — Candidate generation TF-IDF

### Checkpoint 6: Limit TF-IDF to lexical candidate narrowing

Status: not started beyond the Phase 1 rescue shortlist.

### Checkpoint 7: Add large-corpus comparison coverage

Status: not started.

### Checkpoint 8: Evaluate dogfooding test pack impact

Status: deferred until the Phase 1 or Phase 2 outcome is clearer.

Relevant existing memory:

- `dogfooding-test-suite-reusable-prompt-for-phases-1-8-validat-c7c702d8`

### Checkpoint 9: Decide final outcome and consolidate correctly

Status: pending later experiment results.

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
- language-specific heuristics as the backbone of recall

## Review points to consolidate with you

These are the places where I would stop and confirm direction instead of silently pushing forward:

1. After the remaining baseline tests are frozen, to confirm the comparison corpus is representative enough.
2. After repo-jargon and cross-language cases are added, to confirm the Phase 1 signal is still acceptable.
3. After Phase 1 verification and measurements, to decide stop vs proceed.
4. After any Phase 2 large-corpus comparison, to decide keep current, rescue-only, or candidate-generation.
5. Before changing the reusable dogfooding packs, to confirm whether that change is actually warranted.

## Current status

This note is intentionally temporary. It is execution scaffolding for the experiment, not a durable architectural decision by itself.

Current state in plain terms:

- baseline and TF-IDF primitive work has started well
- rescue-only TF-IDF shortlist behavior is implemented
- Phase 1 is not complete until the remaining baseline cases and measurement work are done
