---
title: 'Outcome: Phase 1 Graph Spreading Activation in Recall'
tags:
  - outcome
  - graph-spreading
  - recall
  - phase-1
lifecycle: permanent
createdAt: '2026-04-24T22:38:26.094Z'
updatedAt: '2026-04-24T22:38:26.094Z'
role: context
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
# Outcome: Phase 1 Graph Spreading Activation in Recall

## What was implemented

Graph spreading activation in `mnemonic recall` — traverses 1-hop relationships from top 5 semantic candidates (score ≥ 0.5) and propagates decayed scores to related notes.

### Design constants

- `SPREADING_ENTRY_POINT_LIMIT = 5`
- `SPREADING_HOP_DECAY = 0.5`
- `SPREADING_ACTIVATION_GATE = 0.5`
- `explains`/`derives-from` multiplier = 1.0
- `related-to`/`example-of`/`supersedes`/`follows` multiplier = 0.8

### Pipeline position

Inserted after `applyLexicalReranking` and before `applyCanonicalExplanationPromotion` in `recallNotes`.

### Key files changed

- `src/recall.ts` — `applyGraphSpreadingActivation` and `getRelationshipMultiplier`
- `src/index.ts` — build `noteRelationships` map, invoke spreading activation
- `tests/recall.unit.test.ts` — 11 tests covering basic discovery, existing-candidate boost, no duplication, relationship multipliers, entry point limit, activation gate, score accumulation, edge cases, `semanticScoreForPromotion`

## Review findings

1. **Discovery-only behavior** — Guard skipped existing candidates. Fixed by boosting in-place with a `candidateMap`.
2. **Metadata-starved discovered notes** — Discovered notes lack lexical scores and role metadata. Deferred to Phase 2.
3. **Cross-vault `isCurrentProject` heuristic** — Global notes related to project notes inherit `isCurrentProject: false`. Low impact; deferred to Phase 2.

## Verification

- 703 tests pass (11 more than before graph spreading)
- Typecheck passes
- Dogfooding confirms hybrid recall and architecture notes surface correctly
- Graph-spreading-enabled notes appear in temporary recall

## Status

Phase 1 complete. Phase 2 candidates: metadata enrichment for discovered notes, cross-vault project inheritance.
