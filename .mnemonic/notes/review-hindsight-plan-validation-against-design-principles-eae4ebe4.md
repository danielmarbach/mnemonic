---
title: 'Review: Hindsight Plan Validation Against Design Principles'
tags:
  - workflow
  - review
  - recall
  - hindsight
  - plan-validation
lifecycle: temporary
createdAt: '2026-04-24T18:30:35.753Z'
updatedAt: '2026-04-24T18:30:35.753Z'
role: review
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
# Review: Hindsight Plan Validation Against Design Principles

**Reviewed:** plan-mnemonic-recall-improvements-from-hindsight-research-5b059160
**Research source:** research-hindsight-paper-analysis-for-mnemonic-recall-improv-2d9317b3

## Overall Verdict: PLAN IS SOUND — 3 issues need clarification, 0 blockers

The plan is well-researched, correctly maps the current mnemonic codebase state, respects all design constraints, and stages implementation appropriately. The research note accurately identified what mnemonic does and does not do, and the plan phases are ordered by value-to-cost ratio.

## Validation: All Design Principles Respected

### No database, no daemon, no new committed artifacts

All phases use either in-memory computation (Phases 1, 2, 4) or gitignored derived files (Phase 3 lexical cache). Consistent with the existing `embeddings/` and `projections/` patterns.

### Fail-soft to semantic-first behavior

Every phase has a fail-soft path implied or stated. Phase 1 (activation gating at 0.5 threshold), Phase 2 (RRF falls back to additive), Phase 3 (cache falls back to on-demand tokenization), Phase 4 (skip boost if temporal parsing uncertain).

### Additive, bounded, reversible

Each phase adds a post-processing or scoring layer without removing existing behavior. RRF replaces additive scoring but is a pure scoring change with no storage impact. Spreading activation and temporal boost are additive layers.

### Language independence

Phase 1 uses graph structure (not keywords). Phase 2 uses rank positions (not scores). Phase 3 uses tokens (already guarded by existing language-independence constraints on the rescue path). Phase 4 uses date metadata. The deferral of cross-encoder and observation synthesis is correct.

### One file per note (for notes)

Phase 3 adds a derived cache, not note storage. Consistent with `projections/` and `embeddings/`.

### No auto-relationship via LLM

Spreading activation uses **existing** `relate`-built relationships, not LLM-inferred edges. Consistent.

### Similarity boost, not hard filter

Phase 2's RRF proposition correctly preserves project boost as additive post-RRF term, consistent with the existing +0.15 cosine similarity boost for project notes.

### Explicit metadata outranks inferred

None of the phases override explicit frontmatter with inferred signals. Spreading activation and canonical promotion both operate on the scoring pipeline, not on note metadata.

### Performance principles

Phase 3 should integrate with the existing `src/cache.ts` session cache layer rather than creating an independent I/O path. The plan calls for measuring rescue path latency, which is correct.

### Canonical explanation promotion compatibility

The hybrid design (0.20.0/0.23.0) memory documents that post-processing layers should be "additive, bounded, and reversible." All four phases follow this pattern.

## Issues Needing Clarification

### Issue 1: Spreading activation pipeline position relative to rescue

**Severity:** Medium (implementation detail, not architecture)

The plan says spreading activation sits "after semantic scoring" and candidates "continue to applyLexicalReranking and applyCanonicalExplanationPromotion as usual." This is directionally correct but underspecified.

The current pipeline is: `semantic -> lexical reranking -> canonical promotion -> (rescue + re-promotion) -> selection -> previews`

Questions:

- Should graph-discovered candidates also be eligible for **lexical rescue** if their propagated score is below the 0.35 threshold? (Probably yes — a semantically weak graph discovery could still benefit from rescue.)
- Should graph-discovered candidates receive **canonical explanation promotion**? Yes, but only if their `semanticScoreForPromotion` (the raw propagated score) meets the 0.5 threshold. Since propagated scores are decayed (x0.5), some may not qualify. This should be acknowledged.

**Recommendation:** Add explicit pipeline ordering to Phase 1: `semantic -> spreading activation (insert new candidates with propagated scores) -> lexical reranking -> canonical promotion -> rescue -> re-promotion -> selection`.

### Issue 2: RRF and project boost interaction

**Severity:** Low (already acknowledged, needs precision)

The plan notes "metadata/project boost as small additive post-RRF term." The existing project boost is score-based (+0.15 cosine similarity). In RRF, only rank positions matter for fusion. If project-boosted scores produce different semantic rankings (they do), project priority is already embedded in `semanticRank`. Making it additive again post-RRF would double-count.

**Recommendation:** The post-RRF additive project term should be a tiebreaker nudge (e.g., +0.001 per RRF point), not the full +0.15. Alternatively, project-boosted semantic ranks already carry project priority into RRF — an additive term may not be needed at all. Test both.

### Issue 3: Lexical cache should integrate with session cache

**Severity:** Low (performance, not correctness)

Phase 3 proposes `.mnemonic/lexical-cache.json`. The existing `src/cache.ts` already provides a session-level cache for `listNotes()` + `listEmbeddings()`. Currently `rankDocumentsByTfIdf` does NOT receive a `preparedCorpus` at the call site, meaning it tokenizes fresh every time.

**Recommendation:** Phase 3 should integrate the prepared corpus into the existing session cache invalidation model rather than requiring a separate stale-detection mechanism. This aligns with "prefer in-memory reuse over new I/O."

## Research Accuracy Verification

| Claim | Verdict |
| ----- | ----- |
| Graph traversal not used for recall (only post-hoc previews) | Confirmed: `relationships.ts:154-155`, previews at `index.ts:2655-2663` |
| Additive hybrid scoring (boosted + 0.12*lexical + 0.08*coverage + 0.16*phrase) | Confirmed: `recall.ts:10-13, 84-90` (also has +canonicalExplanation term) |
| TF-IDF rescue tokenizes entire rescue pool | Confirmed: `lexical.ts:181-209`; no `preparedCorpus` at call site |
| Rescue triggers when top semantic less than 0.35 or no results | Confirmed: `lexical.ts:319-327` |
| RRF does not exist | Confirmed: zero grep hits |
| Spreading activation does not exist | Confirmed: zero grep hits |
| Relationship types match claimed list | Confirmed: `storage.ts:7` exact match |
| Pipeline includes rescue + re-promotion after lexical reranking | Plan omits these steps |

## Deferrence Validation

### Cross-encoder reranking correctly deferred

Blocked on Ollama cross-encoder support. Local-first design constraint makes this the right call. Ollama only serves embed and generate endpoints, not cross-encoder models.

### Observation/entity synthesis correctly deferred

mnemonic notes are already structured and self-contained. High cost, unclear benefit for human-authored notes.

## Recommendation

Proceed with Phase 1 implementation after addressing Issue 1 (pipeline position specification). Issues 2 and 3 can be resolved during Phase 2 and Phase 3 implementation respectively — they don't block Phase 1.
