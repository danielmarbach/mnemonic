---
title: TF-IDF hybrid recall staged plan
tags:
  - recall
  - hybrid-search
  - plan
  - implementation
lifecycle: permanent
createdAt: '2026-04-16T19:32:34.302Z'
updatedAt: '2026-04-16T19:32:34.302Z'
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Plan the TF-IDF experiment in two stages.

## Stage 1 — Rescue-only prototype

- Build an in-memory TF-IDF index from projection text only.
- Use it only when semantic confidence is weak, replacing or tightening the current bounded lexical rescue path.
- Keep the index non-persistent and rebuildable from already-loaded projection data.
- Validate no semantic-first regressions, better lexical-heavy rescue quality, and acceptable local performance.

## Stage 2 — Candidate generation for hybrid mode

- Only if Stage 1 succeeds, use TF-IDF earlier in the lexical lane to generate or narrow lexical candidates before final reranking.
- Preserve semantic-first ordering and current project-biased widening behavior.
- Measure whether this reduces lexical work or recall latency on larger fixture corpora.

## Verification themes

- semantic paraphrase remains dominant
- exact repo jargon improves
- project bias stays intact
- weak semantic fallback improves
- cold-start simplicity stays unchanged

This note is the execution plan companion to the TF-IDF design note and will be refined into a more detailed implementation and verification checklist before any code work starts.
