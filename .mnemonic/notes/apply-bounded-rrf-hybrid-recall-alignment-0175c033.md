---
title: 'Apply: bounded RRF hybrid recall alignment'
tags:
  - workflow
  - apply
  - rrf
  - recall
  - ranking
lifecycle: temporary
createdAt: '2026-07-20T16:21:33.957Z'
updatedAt: '2026-07-20T17:05:32.779Z'
role: context
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: plan-one-shot-bounded-rrf-hybrid-recall-alignment-7aa73aaa
    type: follows
memoryVersion: 1
---
Implements the endorsed one-shot plan `plan-one-shot-bounded-rrf-hybrid-recall-alignment-7aa73aaa`.

Checklist:

- [x] Always-on bounded lexical projection channel: TF-IDF top 25 with a 0.05 positive-signal threshold; exact lexical candidates are admitted independently of semantic minSimilarity.
- [x] Rank-only three-channel RRF with K=60 and scale 3.0; raw semantic magnitude is diagnostics/rank input only.
- [x] Bounded semantic-confidence prior (max 0.05), project/attachment priors (0.005/0.0025), metadata/temporal/canonical decomposition.
- [x] Graph rank remains separate and graph spreading does not mutate semantic score/rank.
- [x] Stable note-id tie breaks, rank-window enforcement, and vault-qualified candidate identity for federated candidates.
- [x] Removed hard project-first selection; project affinity is a bounded score prior.
- [x] Added optional compact score decomposition to retrieval evidence, with schema descriptions and text rendering.
- [x] Added lexical-only admission, rank invariance, rank-window, deterministic tie, policy, and diagnostics tests; updated contract snapshots and existing behavior tests.
- [x] Updated ARCHITECTURE.md and user-facing CHANGELOG.md under Unreleased.
- [x] Consolidated prior RRF design notes into canonical design note `canonical-design-bounded-rrf-hybrid-recall-172a96ab`.

Verification:

- `npm run build`: pass.
- `npm test -- --run`: pass, 65 files / 1,137 tests.
- Targeted recall/lexical suites: pass.
- `npm run lint`: four pre-existing Prettier errors remain in src/git.ts, src/storage.ts, tests/helpers/mcp.ts, and tests/mcp-schema-contract.integration.test.ts; changed files are clean.
- `npm run dogfood:isolated`: completed but advisory Pack A was inconclusive because Ollama was unavailable (404 for nomic-embed-text-v2-moe); temporary isolated vault was cleaned.

Deviation/risk: independent lexical retrieval necessarily enumerates visible notes and compact projections on cold global-only recalls because no existing project cache exists in that context. Project recalls reuse the session note/projection/token caches. No database, daemon, synced index, raw-note persistence, or hidden counters were added.
