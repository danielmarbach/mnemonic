---
title: 'Review: Hindsight phases 1-5 comprehensive code and plan audit'
tags:
  - workflow
  - review
  - hindsight
  - recall
  - phases-1-5
lifecycle: temporary
createdAt: '2026-04-25T13:25:23.209Z'
updatedAt: '2026-04-25T13:25:40.838Z'
role: review
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: plan-mnemonic-recall-improvements-from-hindsight-research-5b059160
    type: derives-from
  - id: review-hindsight-plan-validation-against-design-principles-eae4ebe4
    type: derives-from
memoryVersion: 1
---
# Review: Hindsight phases 1-5 comprehensive code and plan audit

**Reviewed:** plan-mnemonic-recall-improvements-from-hindsight-research-5b059160, src/recall.ts, src/index.ts, src/lexical.ts, src/cache.ts, tests/

## Overall Verdict: IMPLEMENTATION IS SOUND — 2 HIGH issues, 15 MEDIUM issues, no blockers

The phases 1-5 implementation faithfully delivers the master plan with two documented deltas. 719 tests pass. Issues are improvement opportunities, not shipping blockers.

---

## HIGH Severity

### H1: `semanticRank` becomes stale after graph spreading mutates scores

`applyLexicalReranking` assigns `semanticRank` based on original `score`. Then `applyGraphSpreadingActivation` mutates `score` and `boosted` on existing candidates. After mutation, `semanticRank` no longer reflects actual ordering. Graph-discovered candidates have no `semanticRank` at all, getting zero RRF contribution.

**Fix:** Re-assign `semanticRank` after graph spreading, or use a pre-spread immutable property for rank assignment.

### H2: Phase 5 temporal filtering fails closed on invalid dates

When `shouldApplyTemporalFiltering` returns true, `isWithinTemporalFilterWindow` returns `false` for notes with invalid `updatedAt`. This excludes notes with bad timestamps rather than including them, violating the fail-soft principle.

**Fix:** Change `isWithinTemporalFilterWindow` to return `true` for invalid dates (fail-open).

---

## MEDIUM Severity

### M1: Graph spreading mutates candidate objects in place

Safe in the linear pipeline but should be documented or copies made.

### M2: Discovered candidates inherit entry point's vault (cross-vault bug)

Related notes may live in a different vault. Downstream code looks in the wrong vault and silently drops the candidate.

### M3: No upper bound on accumulated graph-spreading boost

Multiple entry points pointing to the same candidate accumulate additively with no cap. A hub note can receive 1.5+ boost, dominating the hybrid score.

### M4: Pipeline ordering differs from review recommendation

Delivered: semantic then lexical reranking then spreading then canonical then rescue. Review recommended spreading before lexical reranking. Current order makes `semanticRank` stale after spreading (see H1).

### M5: Project boost (~0.15) dominates RRF (~0.115 max)

Review recommended making project boost a tiebreaker nudge. Implementation adds 0.15 to `boosted` directly, ~5x stronger than the entire RRF contribution.

### M6: Temporal hint detection is English-only

`detectTemporalQueryHint` uses English regex exclusively, violating the language independence constraint. Boost computation is language-independent but the activation gate is not.

### M7: Temporal filtering runs before graph spreading

High-confidence temporal queries exclude candidates before spreading, so older notes can't serve as entry points. Likely desired but should be documented.

### M8: Rescue candidates lose lexical ranking advantage in final hybrid sort

Rescue candidates have no `semanticRank`, so `computeHybridScore` returns `boosted + canonical` with zero RRF. Their lexical ranking is discarded after initial selection.

### M9: Token caching skipped for global scope (no projectId)

When scope is global with no project, token caching is bypassed entirely.

### M10: Named hint table uses first-match-wins

"Recent changes this week" matches "recent" (low confidence, 30-day) before "this week" (medium, 7-day).

### M11: "today" maps to medium confidence (no strict filtering)

Users saying "notes from today" likely expect strict filtering, not just a boost.

### M12: "in the past" not recognized by explicit temporal pattern

Add `in\s+the\s+past` as an alternative in the regex.

### M13: Phase 1 activation gate of 0.5 may be too aggressive

Ollama embeddings often produce similarities in 0.3-0.7 range. Many queries have few entry points above 0.5.

### M14: CANONICAL_HYBRID_WEIGHT=0.005 produces negligible contribution

Max canonical ~0.23 x 0.005 = 0.00115, two orders of magnitude below RRF.

### M15: lexicalRankSignal tiebreaker asymmetric for rescue candidates

Rescue candidates have undefined `coverageScore` and `phraseScore`, creating asymmetric tiebreaking.

### M16: Full cache invalidation causes latency spike after mutations

Acceptable for correctness but creates measurable spike on next recall for large vaults.

---

## Design Constraint Compliance

- **No database/daemon/new artifacts:** PASS — session-scoped cache is in-memory
- **Fail-soft to semantic-first:** FAIL — H2: temporal filtering excludes invalid-date notes
- **Additive, bounded, reversible:** PARTIAL — P1 mutates in-place; P5 filtering is exclusionary; P2 has no revert toggle
- **Language independence:** FAIL — M6: temporal hint detection is English-only
- **One file per note:** PASS — no changes to note storage
- **No auto-relationship via LLM:** PASS — spreading uses existing relationships only

## Test Coverage Gaps

1. No integration test for full temporal pipeline
2. No test for cross-vault discovered candidates getting dropped
3. No test for `applyGraphSpreadingActivation` mutation side effects
4. No direct test for `assignDenseRanks` edge cases

## Outcome

**Continue** with targeted fixes for H1 (stale semanticRank), H2 (fail-open for invalid dates), and documentation of intentional design choices.
