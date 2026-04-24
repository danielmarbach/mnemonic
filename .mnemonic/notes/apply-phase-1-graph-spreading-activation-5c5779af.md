---
title: 'Apply: Phase 1 Graph Spreading Activation'
tags:
  - apply
lifecycle: temporary
createdAt: '2026-04-24T20:16:34.882Z'
updatedAt: '2026-04-24T20:16:34.882Z'
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
# Apply: Phase 1 Graph Spreading Activation

Implemented graph spreading activation in recall.

## Changes

**`src/recall.ts`:**

- Added spreading constants: `SPREADING_ENTRY_POINT_LIMIT = 5`, `SPREADING_HOP_DECAY = 0.5`, `SPREADING_ACTIVATION_GATE = 0.5`, relationship multipliers
- Added `getRelationshipMultiplier(type)` - returns 1.0 for `explains`/`derives-from`, 0.8 for all others
- Added `applyGraphSpreadingActivation(candidates, getNoteRelationships)` - traverses 1-hop relationships from top 5 entry points with score >= 0.5, propagates decayed scores to undiscovered notes

**`src/index.ts`:**

- Imported `applyGraphSpreadingActivation`
- Build `noteRelationships` map during projection text building (reads `note.relatedTo`)
- After `applyLexicalReranking`, applies `applyGraphSpreadingActivation`, then `applyCanonicalExplanationPromotion`
- Graph-discovered candidates flow through full pipeline: lexical reranking → canonical promotion → rescue → re-promotion → selection

**`tests/recall.unit.test.ts`:**

- Added 10 tests covering: basic discovery, no duplication, explains/derives multiplier, entry point limit, activation gate, score accumulation, no relationships case, empty candidate set, semanticScoreForPromotion

## Verification

- All 692 tests pass
- Typecheck passes
- Dogfooding validation pending
