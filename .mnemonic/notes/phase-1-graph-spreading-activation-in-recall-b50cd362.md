---
title: 'Phase 1: Graph Spreading Activation in Recall'
tags:
  - workflow
  - request
lifecycle: temporary
createdAt: '2026-04-24T20:13:47.389Z'
updatedAt: '2026-04-25T21:43:08.351Z'
role: context
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: apply-fix-finding-1-boost-existing-candidates-via-graph-spre-51fad28b
    type: related-to
  - id: phase-1-graph-spreading-activation-completed-1fbe86a2
    type: supersedes
memoryVersion: 1
---
# Request: Phase 1 Graph Spreading Activation in Recall

Implement Phase 1 from the mnemonic Recall Improvements plan.

## Goal

Improve mnemonic's recall quality by adding graph spreading activation — traversing related notes and boosting their scores — when semantic recall produces candidate notes.

## Scope (from plan)

- Entry point limit: top 5 semantic candidates
- Max hops: 1 (conservative)
- Hop decay factor: 0.5
- Relationship type multipliers: `explains`/`derives-from` = 1.0, all others = 0.8
- Activation gating: only propagate if entry point semantic score >= 0.5
- Fail-soft: skip if graph data unavailable or no entry points meet gating threshold

## Success criteria

- Graph-discovered candidates flow through full pipeline: lexical reranking → canonical promotion → rescue → re-promotion → selection
- Existing candidates are boosted (not skipped) when related to entry points (Finding 1 fixed)
- Score accumulation works across multiple entry points
- Dogfooding: "broker simulation design" surfaces `InMemory transport simulation design`
- No regression on existing recall benchmarks
- Tests verify spreading activation discovers related note that pure semantic misses
- Post-implementation review surfaced three findings:
  - Finding 1 (discovery-only behavior) ✅ FIXED — existing candidates now receive score accumulation
  - Finding 2 (metadata-starved discovered notes) 🔮 earmarked for Phase 2
  - Finding 3 (cross-vault `isCurrentProject` heuristic) 🔮 earmarked for Phase 2
- 703 tests pass (up from 692 before graph spreading), typecheck passes
- Date completed: 2026-04-25
