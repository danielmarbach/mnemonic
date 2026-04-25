---
title: 'Plan: Address hindsight phases 1-5 review findings'
tags:
  - workflow
  - plan
  - hindsight
  - recall
  - phases-1-5
lifecycle: temporary
createdAt: '2026-04-25T13:47:30.628Z'
updatedAt: '2026-04-25T21:42:49.274Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: hindsight-phases-1-5-review-findings-addressed-consolidated-2f24cf85
    type: supersedes
memoryVersion: 1
---
# Plan: Address hindsight phases 1-5 review findings

**Source:** `review-hindsight-phases-1-5-comprehensive-code-and-plan-audi-0be2b019`
**Request:** `request-address-hindsight-phases-1-5-comprehensive-review-fi-9718786f`

## Pipeline current order (src/index.ts ~line 2605-2651)

1. Semantic scoring (project boost +0.15 inline)
2. `applyLexicalReranking` → assigns `semanticRank`
3. `applyGraphSpreadingActivation` → mutates `score`/`boosted`, adds discovered candidates (no `semanticRank`)
4. `applyCanonicalExplanationPromotion` → sorts by hybrid score, assigns `lexicalRank`
5. Lexical rescue (conditional) → rescue candidates have no `semanticRank`

## Fix scope

### HIGH — H1: Re-assign semanticRank after graph spreading (src/recall.ts + src/index.ts)

- In `src/index.ts`, after `applyGraphSpreadingActivation`, re-call `assignDenseRanks` to refresh `semanticRank` on all candidates (including graph-discovered ones).
- Need to export `assignDenseRanks` from `recall.ts` or inline the re-assignment.

### HIGH — H2: Fail-open temporal filtering for invalid dates (src/recall.ts)

- In `isWithinTemporalFilterWindow`, change `return false` for invalid dates to `return true`.

### MEDIUM — M5: Reduce project boost from 0.15 to tiebreaker (src/index.ts)

- Extract `PROJECT_SCOPE_BOOST = 0.03` constant, replace two inline `0.15` usages.
- Update tests that assert project boost behavior.

### MEDIUM — M14: Increase CANONICAL_HYBRID_WEIGHT (src/recall.ts)

- Change from `0.005` to `0.05`.

### MEDIUM — M8: Rescue candidates lose lexical ranking advantage (src/recall.ts)

- In `computeHybridScore`, when `semanticRank` is undefined but candidate is a rescue (has `lexicalScore`), compute RRF from lexical-only rank or fall back to a rank based on lexical score position.

## Order of implementation

1. H2 (isolated to 1 function, no test impact)
2. H1 (requires pipeline change + rank re-assignment)
3. M14 (constant change)
4. M5 (constant + test updates)
5. M8 (scoring function change)

## Success criteria

- All 719+ tests pass
- Design constraint compliance improved (fail-soft, bounded, additive)
- Test for H2 invalid-date behavior added
