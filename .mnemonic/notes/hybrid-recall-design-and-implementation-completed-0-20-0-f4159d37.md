---
title: Hybrid recall design and implementation (completed 0.20.0)
tags:
  - recall
  - hybrid-search
  - completed
  - design
  - projections
lifecycle: permanent
createdAt: '2026-04-04T12:32:49.862Z'
updatedAt: '2026-04-16T19:34:48.379Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mnemonic-key-design-decisions-3f2a6273
    type: example-of
  - id: tf-idf-hybrid-recall-experiment-design-e33e51cf
    type: related-to
memoryVersion: 1
---
Hybrid recall improves mnemonic recall quality by combining semantic retrieval with lexical reranking and lexical rescue over existing projection data, while preserving mnemonic's core simplicity constraints.

**Status: COMPLETED** — shipped in 0.20.0 (2026-04-04).

## Design principles

- semantic retrieval remains primary; lexical logic only reranks or rescues within a bounded candidate set
- hybrid logic operates over existing compact projections rather than raw note bodies
- no new synced persistence layer, database, daemon, or hidden runtime state is introduced
- projections remain derived, local-only, and gitignored; the feature must not create new committed artifacts
- failures in lexical or projection-dependent logic must fail soft to the current semantic-first behavior
- output must stay token-efficient and compact rather than dumping raw note bodies or verbose diagnostics

## Implementation

- `src/lexical.ts` — normalization, tokenization, Jaccard/bigram/substring scoring, confidence gate
- `src/recall.ts` — `lexicalScore` on `ScoredRecallCandidate`, `computeHybridScore`, `applyLexicalReranking`
- `src/index.ts` — `collectLexicalRescueCandidates` helper, hybrid recall integration in recall handler

### Key design choices

- Lexical scoring uses a composite: substring match (40%), bigram Jaccard (35%), unigram Jaccard (25%)
- Hybrid weight is 12% — enough to reorder close candidates but not overcome large semantic gaps
- Rescue triggers when top semantic score < 0.35 or no results exist
- Rescue bounded to 3 candidates max, scanned from projections only
- All lexical operations fail-soft to pure semantic behavior

### Test results

- 48 new tests for lexical utilities and hybrid reranking
- Full suite: 574 tests passing, 0 failures

## Definition of done — all met

- semantic-first behavior preserved
- better exact-match and weak-query recall where lexical evidence is strong
- no new storage layer or synced state
- no token growth in default output
- lexical/projection failures degrade gracefully to existing behavior

## Why this fits mnemonic

- it reinforces the existing file-first, projection-based, embedding-driven model
- it adds precision and weak-query recovery without changing the storage model
- it preserves the principle that post-processing layers are additive, bounded, and reversible if they underperform

**related (1):** mnemonic — key design decisions (`mnemonic-key-design-decisions-3f2a6273`) [example-of]
