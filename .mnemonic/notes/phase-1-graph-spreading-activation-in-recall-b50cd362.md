---
title: 'Phase 1: Graph Spreading Activation in Recall'
tags:
  - workflow
  - request
lifecycle: temporary
createdAt: '2026-04-24T20:13:47.389Z'
updatedAt: '2026-04-24T21:41:20.596Z'
role: context
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
# Request: Phase 1 Graph Spreading Activation in Recall

Implement Phase 1 from the mnemonic Recall Improvements plan.

## Goal

Improve mnemonic's recall quality by adding graph spreading activation — traversing related notes and boosting their scores — when semantic recall produces candidate notes.

## - Entry point limit: top 5 semantic candidates

- Max hops: 1 (conservative)
- Hop decay factor: 0.5
- Relationship type multipliers: `explains`/`derives-from` = 1.0, all others = 0.8
- Activation gating: only propagate if entry point semantic score >= 0.5
- Fail-soft: skip if graph data unavailable or no entry points meet gating threshold

- Entry point limit: top 5 semantic candidates
- Max hops: 1 (conservative)
- Hop decay factor: 0.5
- Relationship type multipliers: `explains`/`derives-from` = 1.0, `related-to` = 0.8
- Activation gating: only propagate if entry point semantic score >= 0.5
- Fail-soft: skip if graph data unavailable or no entry points meet gating threshold

## Success criteria- Post-implementation review surfaced two gaps: (1) current implementation is discovery-only — it skips candidates already in the set instead of boosting them, and (2) discovered notes carry no lexical/metadata scores so they rank below original candidates of equal semantic strength. Both are earmarked for Phase 2

- Graph-discovered candidates flow through full pipeline: lexical reranking → canonical promotion → rescue → re-promotion → selection
- Dogfooding: "broker simulation design" surfaces `InMemory transport simulation design`
- No regression on existing recall benchmarks
- Tests verify spreading activation discovers related note that pure semantic misses
