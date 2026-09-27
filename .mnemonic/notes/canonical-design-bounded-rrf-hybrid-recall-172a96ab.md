---
title: 'Canonical design: bounded RRF hybrid recall'
tags:
  - reference
  - decision
  - recall
  - rrf
  - ranking
  - hybrid-search
  - retrieval
lifecycle: permanent
createdAt: '2026-07-20T16:48:31.449Z'
updatedAt: '2026-09-27T14:12:26.419Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: performance-principles-for-file-first-mcp-and-git-backed-wor-4e7d3bc8
    type: derives-from
  - id: mnemonic-key-design-decisions-3f2a6273
    type: related-to
  - id: performance-principles-for-file-first-mcp-and-git-backed-wor-4e7d3bc8
    type: related-to
  - id: mnemonic-key-design-decisions-3f2a6273
    type: example-of
  - id: duckdb-as-a-derived-retrieval-index-evaluation-and-recommend-6c4c32b9
    type: related-to
  - id: apply-bounded-rrf-hybrid-recall-alignment-consolidated-2ece69b3
    type: related-to
memoryVersion: 1
---
Supersede fragmented RRF and hybrid-recall notes with the current implemented design and its product constraints.

Mnemonic recall uses a bounded, fail-soft hybrid ranking pipeline designed around retrieval agreement while preserving product-level context policies.

## Retrieval channels

1. Semantic retrieval scans compatible embeddings and applies the caller's `minSimilarity` gate. Candidates receive deterministic semantic ranks from raw cosine ordering; raw semantic magnitude is retained for diagnostics and bounded confidence only.
2. Lexical retrieval runs for every recall over compact derived projection text. TF-IDF with title, weighted coverage, and lexical overlap signals produces a bounded top-25 channel with a minimum positive signal threshold. It is independent of semantic admission, so exact identifiers, phrases, names, error codes, and version strings can enter even when semantic similarity is weak. Lexical/projection failures fail soft.
3. Graph expansion is intentionally bounded and semantic-conditioned: the top five semantic entries with score at least 0.5 seed one-hop typed relationship spreading. Graph activation receives its own rank and never mutates semantic score or semantic rank.
4. Exact-identifier retrieval (since 0.46.0) exists only when the query contains a compound identifier (camelCase, snake_case, SCREAMING_SNAKE, kebab-case, dotted versions). Notes whose lexical tokens contain the identifier's joined form (so `RRF_K`, `rrf-k` and `rrfK` share `rrfk`) are ranked by number of query identifiers matched, then lexical evidence, then id. Holders outside the lexical top 25 still enter fusion. Identifier-only holders get no lexical rank. The channel reuses session-cached tokens and adds no I/O.

Candidates are unioned by stable note id. Missing channel ranks contribute zero.

## Fusion and policy

For K=60, scaled RRF is:

```text
rrfScore = 3.0 * (1/(60 + semanticRank) + 1/(60 + lexicalRank) + 1/(60 + graphRank) + 1/(60 + identifierRank))
```

The final score is bounded RRF plus explicit adjustments:

```text
finalScore = rrfScore
  + semanticConfidencePrior (max 0.05)
  + projectPrior (0.005 local, 0.0025 attached)
  + temporalPrior (query-dependent bounded recency)
  + metadataPrior (role, importance, explicit alwaysLoad)
  + canonicalPrior (bounded explanation promotion)
```

Raw semantic magnitude is never added directly to final ranking. Semantic confidence may resolve close results but cannot replace strong multi-channel agreement. Project affinity is a prior, not a hard project-first selector. Explicit high-confidence temporal windows remain product filtering before ranking; named or low-confidence temporal hints remain bounded boosts. Canonical explanation signals remain late, bounded policy/context shaping rather than retrieval evidence.

## Determinism and windows

Channel sorts use stable note-id tie breakers. Tied scores use deterministic competition ranks, and only the first 100 positions can contribute to each RRF channel; ranks beyond the window are unset. Equal channel scores therefore remain reproducible without relying on filesystem enumeration order.

## Diagnostics and constraints

`evidence: compact` optionally exposes semantic, lexical, graph, and identifier ranks plus RRF, semantic-confidence, project, temporal, metadata, canonical, and final-score contributions. Default output remains compact. The implementation uses existing markdown/projection/embedding storage and session caches; it adds no database, daemon, synced index, raw-note persistence, or hidden counters.

The design is informed by the supplied RRF reference: RRF fuses independent ranked lists, uses zero for missing channels, commonly uses K=60, and requires deterministic upstream ordering and bounded rank windows. Parameters remain evaluation-tunable, but changes must preserve exact-identifier recall, semantic quality, graph discovery, project awareness, language independence, and fail-soft behavior.

## Exact-identifier channel decision (0.46.0)

Exact identifier matches are retrieval evidence, so they enter as an equally weighted RRF rank rather than a prior; priors stay reserved for policy (project, temporal, metadata, canonical). Before the channel, an exact holder was a single lexical rank and lost to notes matching the identifier's camelCase parts in both semantic and lexical channels, or to a role metadata prior (0.012 vs a 0.0023 rank gap). Equal weight was kept deliberately instead of a tuned channel weight. Measured with `npm run eval:recall`: identifier S@1 0.58 -> 0.92, MRR@10 0.79 -> 0.96, all other query kinds unchanged. Real vault: `recallScopeNoteCount` top 3 are all holders. For `RRF_K` the holders reach #3/#4 behind two notes with semantic+lexical agreement that discuss K=60; accepted, since those are the most relevant notes about the concept.
