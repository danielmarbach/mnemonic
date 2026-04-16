---
title: TF-IDF hybrid recall experiment design
tags:
  - recall
  - hybrid-search
  - design
  - projections
lifecycle: permanent
createdAt: '2026-04-16T19:32:34.301Z'
updatedAt: '2026-04-16T19:34:48.386Z'
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
Semantic-first recall remains the primary retrieval path in mnemonic. TF-IDF is acceptable only as a derived lexical helper over projection text if it produces measurable recall-quality or latency gains without changing mnemonic's file-first, MCP-first operational model.

## Decision

Treat TF-IDF as a staged experiment, not a new architectural pillar.

- Build TF-IDF only from derived retrieval text, never raw markdown note bodies.
- Keep semantic retrieval, project-biased widening, and semantic-first ranking behavior unchanged.
- Limit TF-IDF to the lexical lane so it can assist weak lexical cases without becoming the main ranker.
- Keep the feature rebuildable, disposable, local, and optional, in the same spirit as embeddings and projections.
- Reject any variant that introduces a database, always-on service, committed index artifacts, or lifecycle complexity beyond the current stdio MCP model.

## Why this fits mnemonic

This preserves the architecture documented in `ARCHITECTURE.md`: notes remain the durable source of truth, embeddings and projections remain derived local artifacts, recall stays project-biased rather than project-exclusive, and local dogfooding continues to work through the normal on-demand MCP entrypoint.

The current shipped hybrid recall note is the baseline, not something to replace. This experiment is only justified if TF-IDF improves lexical-heavy precision or candidate-selection cost while preserving semantic paraphrase quality and the current simple operational shape.

## Constraints and invariants

- No regression for strong semantic paraphrase queries.
- No change to project-first widening behavior across project and global memories.
- No new persistent source of truth.
- Fail-soft behavior must remain: disabling or failing TF-IDF falls back to current semantic-plus-lightweight-lexical behavior.
- Verification must be done against realistic note growth, not only micro-benchmarks.

## Adopt / reject criteria

Keep the current design if TF-IDF does not clearly improve lexical-heavy recall, harms paraphrase quality, or adds more complexity than the benefit justifies.

Adopt rescue-only TF-IDF if it improves identifier-heavy and repo-jargon queries without semantic regressions, but candidate-generation gains remain unclear.

Adopt TF-IDF candidate generation in hybrid mode only if rescue-only results are already positive and larger-corpus verification shows clear cost or latency wins while preserving the same explainable ranking story: semantic first, lexical assists, project bias preserved.
