---
title: 'Hybrid recall design and implementation (0.20.0, 0.23.0)'
tags:
  - recall
  - hybrid-search
  - design
  - completed
lifecycle: permanent
createdAt: '2026-04-17T13:14:34.706Z'
updatedAt: '2026-04-24T18:31:02.115Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: performance-principles-for-file-first-mcp-and-git-backed-wor-4e7d3bc8
    type: related-to
  - id: mnemonic-key-design-decisions-3f2a6273
    type: example-of
memoryVersion: 1
---
Hybrid recall improves mnemonic recall quality by combining semantic retrieval with lexical reranking, lexical rescue, and canonical explanation promotion over existing projection data, while preserving mnemonic's core simplicity constraints.

**Status: COMPLETED** — shipped in 0.20.0 (2026-04-04), enhanced in 0.23.0.

## Design principles

- semantic retrieval remains primary; lexical logic only reranks or rescues within a bounded candidate set
- hybrid logic operates over existing compact projections rather than raw note bodies
- no new synced persistence layer, database, daemon, or hidden runtime state is introduced
- projections remain derived, local-only, and gitignored; the feature must not create new committed artifacts
- failures in lexical or projection-dependent logic must fail soft to the current semantic-first behavior
- output must stay token-efficient and compact rather than dumping raw note bodies or verbose diagnostics

## Implementation

- `src/lexical.ts` — normalization, tokenization, Jaccard/bigram/substring scoring, confidence gate, TF-IDF rescue ranking
- `src/recall.ts` — `lexicalScore` on `ScoredRecallCandidate`, `computeHybridScore`, `applyLexicalReranking`, `computeCanonicalExplanationScore`, `applyCanonicalExplanationPromotion`
- `src/index.ts` — `collectLexicalRescueCandidates` helper, `buildRecallCandidateContext` helper, hybrid recall integration in recall handler

## Key design choices

- Lexical scoring uses a composite: substring match (40%), bigram Jaccard (35%), unigram Jaccard (25%)
- Hybrid weight is 12% — enough to reorder close candidates but not overcome large semantic gaps
- Rescue triggers when top semantic score < 0.35 or no results exist
- Rescue bounded to 3 candidates max, scanned from projections only
- All lexical operations fail-soft to pure semantic behavior

## TF-IDF rescue ranking (adopted 0.23.0)

TF-IDF was evaluated as a staged experiment, not a new architectural pillar. The experiment concluded with a decision to adopt rescue-only TF-IDF ranking.

- TF-IDF ranks the eligible rescue pool by similarity before applying the bounded rescue limit, replacing the previous sequential scan
- Title-aware boost ensures exact title matches can beat repeated generic decoys in realistic note-shaped corpora
- Prepared corpus optimization avoids rebuilding tokenization and IDF data during ranking
- MRR on rare-term queries improved from 0.400 to 0.607; broad-query MRR stays at 1.000
- Timing comparable to the previous path after optimization (~10-16ms vs ~9-13ms)
- TF-IDF is built only from derived retrieval text, never raw markdown note bodies
- No database, always-on service, committed index artifacts, or lifecycle complexity beyond the current stdio MCP model
- Full hybrid mode (TF-IDF candidate generation alongside semantic) was not adopted because rescue-only results were already positive

### Language-independence guardrail

- TF-IDF operates only in the rescue lane, never displacing strong semantic matches
- Tuning decisions must not optimize only for English-heavy vocabulary or mnemonic-specific note titles
- Unsupported-language and mixed-language notes degrade gracefully rather than being systematically pushed down
- Wording-heavy TF-IDF wins are acceptable only when they do not regress cross-language behavior

## Canonical explanation promotion (added 0.23.0)

Bounded promotion of notes that are strong canonical explanations for rationale-style queries:

- Semantic plausibility gate: promotion only applies to candidates with score >= 0.5 (MIN_CANONICAL_EXPLANATION_SCORE)
- Language-independent primary signals: lifecycle (permanent), role (decision/overview/context), relationship centrality, connection diversity, structure score
- Wording is the smallest contributor (capped at 0.02), ensuring non-English notes benefit equally
- `semanticScoreForPromotion` tracks the raw semantic score separately from the promoted score, so rescue trigger logic stays honest
- minSimilarity bypass: lexical rescue is suppressed when minSimilarity exceeds the default threshold, preventing rescue candidates from bypassing explicit user filters
- Bug fix: `shouldTriggerLexicalRescue` corrected to return true for empty result sets

## Test coverage

- 48 new tests for lexical utilities and hybrid reranking (0.20.0)
- 87 tests in recall and lexical suites at 0.23.0
- Integration tests cover TF-IDF rescue, canonical explanation promotion, minSimilarity bypass, and rationale-query guardrails
- Isolated dogfooding (Pack A/B/C) confirms no regression from TF-IDF or canonical promotion

## Definition of done — all met

- semantic-first behavior preserved
- better exact-match and weak-query recall where lexical evidence is strong
- no new storage layer or synced state
- no token growth in default output
- lexical/projection failures degrade gracefully to existing behavior
- canonical explanation promotion uses language-independent signals
- TF-IDF rescue improves rare-term recall without regressing broad queries

## Why this fits mnemonic

- reinforces the existing file-first, projection-based, embedding-driven model
- adds precision and weak-query recovery without changing the storage model
- preserves the principle that post-processing layers are additive, bounded, and reversible if they underperform
- canonical promotion respects language independence and project bias by using graph and structural signals rather than wording heuristics
