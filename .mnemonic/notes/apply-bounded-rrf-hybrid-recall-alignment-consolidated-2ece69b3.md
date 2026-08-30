---
title: 'Apply: bounded RRF hybrid recall alignment (consolidated)'
tags:
  - workflow
  - apply
  - rrf
  - recall
  - ranking
  - plan
  - hybrid-search
lifecycle: permanent
createdAt: '2026-08-30T11:24:05.989Z'
updatedAt: '2026-08-30T11:24:09.382Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: canonical-design-bounded-rrf-hybrid-recall-172a96ab
    type: related-to
memoryVersion: 1
---
Merge the completed one-shot RRF alignment plan and its apply checklist into a single delivery record; the design itself lives in canonical-design-bounded-rrf-hybrid-recall-172a96ab.

One-shot alignment of recall ranking to RRF-correct behavior, delivered as a single coherent change on top of the file-first/semantic-first constraints. The authoritative design record is `canonical-design-bounded-rrf-hybrid-recall-172a96ab`; this note records the transition, delivery, and verification.

## Motivation (pre-alignment gaps found in research)

The pre-alignment ranker was a hybrid semantic-first ranker, not an independent-channel RRF pipeline:

- lexical scoring only reranked already-semantic candidates; TF-IDF rescue fired only when the strongest semantic score was below 0.35 — exact identifier or phrase matches outside the semantic set could never enter fusion
- raw semantic magnitude dominated: `boosted = raw cosine + boosts` and RRF contributed at most ~0.15 after scaling; the all-ranks-missing fallback returned raw boosted scores, so out-of-window candidates still affected ordering
- graph expansion was semantic-conditioned (top-5 semantic seeds, score >= 0.5) rather than an independent channel
- determinism gaps: no stable note-id tie-breakers; "dense" ranks were actually competition ranks (1,1,3); rank-window truncation keyed on array position
- hard project-first selection in `selectRecallResults`/`selectWorkflowResults` could overturn strong global retrieval consensus

## What shipped

- Always-on bounded lexical channel: TF-IDF top 25 over compact projection text, 0.05 positive-signal threshold, admitted independently of semantic `minSimilarity` (exact identifiers, phrases, names, error codes enter even with weak semantic similarity); lexical failures fail soft
- Rank-only three-channel RRF (K=60, scale 3.0); raw semantic magnitude demoted to diagnostics plus a bounded semantic-confidence prior (max 0.05)
- Bounded priors: project (0.005 local / 0.0025 attached), temporal, metadata, canonical; hard project-first selection removed — project affinity is a prior only
- Graph keeps an independent rank; spreading never mutates semantic score or rank
- Stable note-id tie breaks, rank-window enforcement (first 100 positions), vault-qualified candidate identity for federated candidates
- Optional compact score decomposition in recall evidence (schema-described, text-rendered)

## Verification

- Full suite green: 65 files / 1,137 tests; build/typecheck pass; changed files lint-clean (pre-existing Prettier errors in unrelated files reported separately)
- New coverage: lexical-only admission, rank invariance, rank-window suppression, deterministic ties, policy behavior, diagnostics; contract snapshots updated
- Prior fragmented RRF design notes consolidated into the canonical design note

## Known deviation

Cold global-only recalls (no project session cache) necessarily enumerate visible notes/projections to provide the independent lexical channel; project recalls reuse session caches. No database, daemon, synced index, raw-note persistence, or hidden counters were added.

Consolidated from plan `plan-one-shot-bounded-rrf-hybrid-recall-alignment-7aa73aaa` and apply `apply-bounded-rrf-hybrid-recall-alignment-0175c033`.
