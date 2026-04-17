---
title: TF-IDF hybrid recall design (adopted rescue-only)
tags:
  - recall
  - hybrid-search
  - design
  - projections
  - completed
lifecycle: permanent
createdAt: '2026-04-16T19:32:34.301Z'
updatedAt: '2026-04-17T11:17:22.388Z'
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: tf-idf-hybrid-recall-staged-plan-7c61f6f1
    type: explains
  - id: hybrid-recall-design-and-implementation-completed-0-20-0-f4159d37
    type: related-to
  - id: performance-principles-for-file-first-mcp-and-git-backed-wor-4e7d3bc8
    type: related-to
memoryVersion: 1
---
Semantic-first recall remains the primary retrieval path in mnemonic. TF-IDF is accepted as a derived lexical helper over projection text, adopted after staged experimentation confirmed measurable recall-quality gains without regressing semantic paraphrase quality, language independence, or the simple operational model.

## Decision: adopted rescue-only TF-IDF

The experiment concluded with a decision to adopt rescue-only TF-IDF ranking. Key outcomes:

- TF-IDF ranks the eligible rescue pool by similarity before applying the bounded rescue limit, replacing the previous sequential scan
- Title-aware boost ensures exact title matches can beat repeated generic decoys in realistic note-shaped corpora
- Prepared corpus optimization avoids rebuilding tokenization and IDF data during ranking
- MRR on rare-term queries improved from 0.400 to 0.607; broad-query MRR stays at 1.000
- Timing is comparable to the previous path (~10-16ms after optimization vs ~9-13ms before)
- Isolated dogfooding confirmed no new regression in user-facing recall/orientation workflow
- Language independence is preserved: TF-IDF operates only in the rescue lane, never displacing strong semantic matches

TF-IDF candidate generation in hybrid mode was not adopted because rescue-only results were already positive and full hybrid mode did not show clear additional wins.

## Architecture

- Build TF-IDF only from derived retrieval text, never raw markdown note bodies
- Keep semantic retrieval, project-biased widening, and semantic-first ranking behavior unchanged
- Limit TF-IDF to the lexical lane so it assists weak lexical cases without becoming the main ranker
- Keep the feature rebuildable, disposable, local, and optional, in the same spirit as embeddings and projections
- No database, always-on service, committed index artifacts, or lifecycle complexity beyond the current stdio MCP model

## Language-independence guardrail

- TF-IDF may improve exact lexical recovery, but it must remain a supplementary signal under the semantic-first path, not the backbone of recall
- Tuning decisions must not optimize only for mnemonic's own English-heavy vocabulary or note titles
- Unsupported-language and mixed-language notes degrade gracefully rather than being systematically pushed down
- A wording-heavy TF-IDF win is acceptable only when it does not regress cross-language behavior or displace strong semantic matches

## Constraints and invariants

- No regression for strong semantic paraphrase queries
- No change to project-first widening behavior across project and global memories
- No new persistent source of truth
- Fail-soft behavior must remain: disabling or failing TF-IDF falls back to current semantic-plus-lightweight-lexical behavior
- Verification must be done against realistic note growth, not only micro-benchmarks
- Verification must include at least a light cross-language sanity check so TF-IDF is not tuned only for English lexical wins
