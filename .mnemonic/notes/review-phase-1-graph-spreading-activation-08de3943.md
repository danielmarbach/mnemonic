---
title: 'Review: Phase 1 Graph Spreading Activation'
tags:
  - review
lifecycle: temporary
createdAt: '2026-04-24T20:16:41.169Z'
updatedAt: '2026-04-24T20:43:30.006Z'
role: review
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: hybrid-recall-design-and-implementation-0-20-0-0-23-0-350317a0
    type: related-to
memoryVersion: 1
---
# Review: Phase 1 Graph Spreading Activation

## Implementation Review

**What was built:**

- Graph spreading activation traverses 1-hop relationships from top 5 semantic entry points (score >= 0.5)
- Propagates scores with decay factor 0.5 and relationship-type multipliers (1.0 for explains/derives-from, 0.8 for others)
- Graph-discovered candidates flow through full pipeline: lexical reranking canonical promotion rescue re-promotion selection

**Verification:**

- 692 tests pass (no regression)
- Typecheck passes
- 10 new unit tests cover: basic discovery, no duplication, multiplier differences, entry point limit, activation gate, score accumulation, empty/edge cases
- Dogfooding ran against local build: hybrid recall and architecture notes surface correctly, graph-spreading-enabled notes appear in temporary recall

**Dogfood results:**

- hybridTop: "Hybrid recall design and implementation (0.20.0, 0.23.0)" correct
- architectureTop: "Enrichment layer design..." correct
- recalledTemporaryTitles includes "Phase 1: Graph Spreading Activation in Recall" graph notes recalled correctly
- Note: unrelated packC lint-rejection failure exists (semantic-patch broken link not rejected) not part of this phase

**Plan alignment:**

- Entry point limit: 5 OK
- Max hops: 1 OK
- Hop decay: 0.5 OK
- Activation gate: >= 0.5 OK
- explains/derives-from = 1.0 OK
- related-to/others = 0.8 OK
- Fail-soft if no graph data OK
- Pipeline position: after lexical, before canonical OK

## Independent Review Findings (2026-04-24)

Reviewed by independent reviewer reading every line of src/recall.ts:251-318, src/index.ts:2511-2555, and all 10 tests. Plan alignment confirmed.

### Finding 1 — Discovery-only, not spreading activation

At src/recall.ts:288: the guard `if (existingIds.has(rel.id) && !discovered.has(rel.id)) continue;` skips notes already in the candidate set entirely. Classic spreading activation propagates to ALL connected nodes this implementation is discovery-only.

Impact: In real vaults where connected notes co-appear in semantic results (shared vocabulary), the strongest signal from relationships is boosting already-surfaced notes, not finding net-new ones.

### Finding 2 — Discovered notes are metadata-starved for downstream pipeline

At src/recall.ts:294-301, discovered notes omit lexicalScore, coverageScore, phraseScore, lifecycle, relatedCount, connectionDiversity, structureScore, and metadata. Both computeHybridScore and computeCanonicalExplanationScore return 0 for these slots. Discovered notes systematically rank below original candidates of equal semantic strength.

### Finding 3 — isCurrentProject heuristic for cross-vault relationships

At src/recall.ts:300: isCurrentProject is inherited from the entry point. A global note related to a project note inherits false. Low impact given fallback paths.

## Recommendation

Fix Finding 1 by changing the guard condition at line 288 to accumulate score onto existing candidates instead of skipping them. Score accumulation already works (lines 302-308), just the guard prevents its use. This is a one-line change plus a test. The metadata gap (Finding 2) can follow in the same batch or be deferred to Phase 2.
