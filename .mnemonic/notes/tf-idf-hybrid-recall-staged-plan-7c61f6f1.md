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
updatedAt: '2026-04-16T19:43:55.338Z'
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
- `tests/recall.unit.test.ts` if project-bias assertions fit better there

Actions:

- document the current rescue trigger, result limits, and ranking signals in the note or PR description
- add any missing baseline regression tests before changing behavior
- make the baseline comparison explicit rather than relying on informal recall quality judgments

Baseline matrix to lock down before TF-IDF changes:

1. Semantic paraphrase safety

- target file: `tests/recall-embeddings.integration.test.ts`
- proposed test name: `it("keeps semantic paraphrase matches ahead when lexical overlap is weak", async () => { ... })`
- fixture shape:
  - note A id: `semantic-target`
  - title: `CI learning promotion guidance`
  - content: wording about promoting learnings from CI failures into durable memory
  - tags: `ci`, `learning`, `design`
  - note B id: `lexical-decoy`
  - title: `Promotion checklist`
  - content: repeated lexical uses of `promotion`, `guidance`, or `workflow` without the same meaning
  - embeddings:
    - `semantic-target` gets the same vector as the query
    - `lexical-decoy` gets a weaker but nonzero vector
  - query shape: `how we handle promotion of CI learnings`
- expected assertions:
  - result 0 id is `semantic-target`
  - decoy does not displace the semantic note even if it has stronger exact-token overlap
- rationale: this is the core semantic-first safety test for the experiment

1. Exact lexical title match

- target file: `tests/recall-embeddings.integration.test.ts`
- existing nearby coverage: `reranks semantic ties using projections even when no projection cache is warm`
- proposed companion test name if a separate one is still useful: `it("prefers the exact title match among semantically tied notes", async () => { ... })`
- fixture shape:
  - note A id: `hybrid-design`
  - title: `Hybrid Recall Design`
  - content: exact design notes for hybrid recall
  - note B id: `retrieval-notes`
  - title: `Retrieval Notes`
  - content: semantically similar but less exact lexical match
  - embeddings: identical vectors to force lexical tie-breaking
  - query shape: `hybrid recall design`
- expected assertions:
  - result 0 id is `hybrid-design`
  - lexical tie-break remains deterministic in a cold projection state
- rationale: this is already partly covered and should remain explicitly preserved across TF-IDF changes

1. Identifier and repo-jargon lookup

- target file: `tests/recall-embeddings.integration.test.ts`
- proposed test name: `it("rescues rare repo-jargon queries with the strongest lexical match", async () => { ... })`
- fixture shape:
  - note A id: `projection-doc`
  - title: `Projection layer notes`
  - content: mentions `projectionText`, `staleness`, and `derived retrieval text`
  - note B id: `general-recall`
  - title: `Recall notes`
  - content: broad recall concepts without rare implementation terms
  - note C id: `id-like-target`
  - title: `Hybrid recall design`
  - content: includes a rare term such as `projectionText` or another stable implementation token used in real code
  - embeddings: all weak and similar so lexical rescue matters
  - query shape: `projectionText staleness`
- expected assertions:
  - result set contains `projection-doc` or `id-like-target` first depending on chosen corpus wording
  - broad recall note does not outrank the rare-token match
- rationale: this is the primary lexical-heavy win case the TF-IDF experiment must improve

1. Weak semantic rescue quality

- target file: `tests/recall-embeddings.integration.test.ts`
- existing nearby coverage: `lexical rescue keeps the strongest projection matches instead of first-seen notes`
- proposed companion test name if tightening is needed: `it("returns only plausible rescue candidates when semantic scores are weak", async () => { ... })`
- fixture shape:
  - preserve the existing four-note shape (`a-weak`, `b-mid`, `c-mid`, `d-strong`) or rename for clarity
  - all embeddings remain equally weak negative vectors
  - query shape: `hybrid recall design`
- expected assertions:
  - top result remains the strongest lexical note
  - obviously weak note is excluded from rescued results
  - result ordering is by lexical strength rather than file creation order
- rationale: this is the direct baseline against which Phase 1 rescue-only TF-IDF should be compared

1. Project-first widening invariants

- target file: `tests/recall.unit.test.ts`
- existing coverage already present:
  - `prefers current-project matches before widening to global results`
  - `returns only project matches when they fill the limit`
  - `keeps stronger project preference behavior intact after additive metadata boosts`
- proposed additional test name if the experiment starts touching candidate selection too early: `it("preserves project-first widening when lexical signals exist on both project and global candidates", () => { ... })`
- fixture shape:
  - project candidate A: moderate semantic score, strong lexical score, `isCurrentProject: true`
  - project candidate B: slightly lower semantic score, acceptable lexical score, `isCurrentProject: true`
  - global candidate: best raw semantic score, strong lexical score, `isCurrentProject: false`
- expected assertions:
  - project candidates still fill first for `scope: "all"`
  - global candidate only appears after project slots are exhausted
- rationale: if TF-IDF is introduced into candidate selection later, this invariant becomes easy to accidentally weaken

1. Cold-start operational simplicity

- target file: `tests/recall-embeddings.integration.test.ts` or MCP smoke coverage using `tests/helpers/mcp.ts`
- proposed test name: `it("recall works through the local MCP entrypoint without TF-IDF prewarming", async () => { ... })`
- fixture shape:
  - use the normal temporary vault setup and fake embedding server
  - seed one exact lexical target and one distractor
  - do not precompute or warm any extra runtime state beyond what the current tests already do
  - query shape: one lexical-heavy query and one semantic query if the test remains concise
- expected assertions:
  - recall returns valid structured content through the real entrypoint
  - intended result ranks first
  - no extra setup step, file artifact, or service dependency is introduced
- rationale: this protects the MCP-first operational shape while the experiment evolves

Success condition:

- current behavior is locked down tightly enough that TF-IDF changes can be judged against a fixed matrix instead of memory or intuition
- at least one explicit baseline test exists for each of the six categories above

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

Proposed unit test names:

- `it("computes normalized term frequency for repeated tokens", () => { ... })`
- `it("assigns higher inverse-document frequency to rarer terms", () => { ... })`
- `it("builds deterministic tf-idf rankings for a fixed corpus", () => { ... })`
- `it("returns empty or zero scores for empty corpora and empty queries", () => { ... })`
- `it("prefers rare-token documents over broad fuzzy matches", () => { ... })`

Suggested fixture corpus for ranking tests:

- doc `rare-target`: `projectiontext staleness derived retrieval text`
- doc `broad-related`: `retrieval text retrieval notes design`
- doc `unrelated`: `cooking recipes weekly menu`
- query: `projectiontext staleness`

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

Proposed test names:

- `it("activates tf-idf rescue only when semantic confidence is weak", async () => { ... })`
- `it("skips tf-idf rescue when semantic results are already strong", async () => { ... })`
- `it("uses tf-idf rescue to prioritize identifier-heavy matches", async () => { ... })`
- `it("fails soft when projection text is partially unavailable", async () => { ... })`

Suggested fixture shape:

- 4 to 6 notes with near-identical weak embeddings
- one target note containing repeated rare lexical terms in projection text
- one broad semantic decoy
- one first-created weak note to guard against accidental first-seen ordering

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

Candidate scenario-to-test mapping:

- paraphrase safety: `keeps semantic paraphrase matches ahead when lexical overlap is weak`
- exact lexical tie-break: existing `reranks semantic ties using projections even when no projection cache is warm`
- rescue quality: existing `lexical rescue keeps the strongest projection matches instead of first-seen notes`
- repo jargon gain: `rescues rare repo-jargon queries with the strongest lexical match`
- cold-start simplicity: `recall works through the local MCP entrypoint without TF-IDF prewarming`

Success condition:

- the test suite demonstrates clear improvement for lexical-heavy cases with no visible semantic-first regression

### Checkpoint 5: Measure Phase 1 cost before proceeding

Likely files:

- existing tests plus a lightweight benchmark-style test if needed

Actions:

- compare current rescue vs TF-IDF rescue on a larger synthetic or fixture corpus
- record build-time cost, query-time cost, and whether memory overhead is still modest
- capture whether the result feels like a helper layer rather than an indexing subsystem

Suggested benchmark fixture shape:

- 50 to 200 notes
- 20 to 40 project-local notes
- remainder global-style notes
- 3 query classes:
  - semantic paraphrase
  - exact jargon or identifier
  - mixed project-plus-global lookup

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

Suggested unit-level guard test:

- `it("does not let lexical candidate narrowing overcome a large semantic gap", () => { ... })`

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

Proposed test names or benchmark labels:

- `large corpus: semantic paraphrase remains dominant`
- `large corpus: identifier-heavy query benefits from tf-idf candidate narrowing`
- `large corpus: project-local results still fill before global fallback`
- `large corpus: useful global companion note still appears when project results are incomplete`

Success condition:

- TF-IDF candidate narrowing is equal or better than both the current design and rescue-only TF-IDF on relevance, while reducing lexical work or staying latency-neutral

### Checkpoint 8: Evaluate dogfooding test pack impact

Relevant existing memory:

- `dogfooding-test-suite-reusable-prompt-for-phases-1-8-validat-c7c702d8`

Actions:

- after the experiment outcome is known, review whether the reusable dogfooding packs need to change
- keep the packs unchanged if TF-IDF is invisible at the product-behavior level and existing recall scenarios already cover the new behavior well enough
- update the packs only if the final retrieval behavior introduces a genuinely new regression surface or a better canonical phrasing test

Questions to answer at this checkpoint:

- does the current cold hybrid phrasing scenario already cover the new behavior sufficiently?
- should exact-jargon or identifier-heavy recall get its own standing dogfooding prompt?
- if Phase 2 lands, do the packs need a larger-corpus or mixed project-plus-global retrieval check?
- if the experiment is rejected, should any temporary validation prompts stay out of the reusable packs?

Success condition:

- the permanent dogfooding packs only change if the product's standing regression surface has actually changed

### Checkpoint 9: Decide final outcome and consolidate correctly

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
5. Before changing the reusable dogfooding packs, to confirm whether that change is actually warranted.

## Current status

This note is intentionally temporary. It is execution scaffolding for the experiment, not a durable architectural decision by itself.
