---
title: >-
  Decision: keep embeddings after agentic-search critique; add full-text recall
  channel
tags:
  - decision
  - retrieval
  - embeddings
  - hybrid-search
  - recall
  - research
lifecycle: permanent
createdAt: '2026-09-28T13:12:03.621Z'
updatedAt: '2026-09-28T13:12:11.984Z'
role: decision
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: canonical-design-bounded-rrf-hybrid-recall-172a96ab
    type: related-to
  - id: duckdb-as-a-derived-retrieval-index-evaluation-and-recommend-6c4c32b9
    type: related-to
memoryVersion: 1
---
Decision: an agentic-search critique of vector RAG does not justify dropping embeddings from mnemonic; it exposed that recall could not see deep body wording, fixed by the full-text RRF channel (72f07e7).

## Source and claim

Abdullah Grewal, "AI Agents Don't Need Vector Search Anymore" (Medium, 2026-05). Claim: coding agents (Claude Code, Cursor, Cline) replaced vector RAG with agent-driven grep/glob/read ("just-in-time loading") for freshness, exact identifiers, no index liability, and simplicity. The article concedes vectors win on vocabulary-mismatch queries and predicts hybrid ("small vector layer + lots of tools") as the default. Its evidence is weaker than its headline: the cited Amazon paper shows keyword agents at 88-94% of RAG, i.e. RAG still ahead.

## Why the core argument does not transfer to memory

- Staleness: notes change only through mnemonic tools, which re-embed immediately; sync backfills.
- Identifiers: already covered by the always-on lexical and exact-identifier channels.
- Index liability: embeddings are local and gitignored; only remote providers (OpenAI, Gemini) send note text off the host.
- Vocabulary mismatch is the normal memory case: an agent cannot guess the words a past session used, unlike code identifiers.
- Agents with a shell can already grep plain-markdown notes, so mnemonic offers both paths.

## Evidence from npm run eval:recall (MRR@10)

Embeddings earn their keep: with Ollama versus embeddings unavailable, title 0.906 vs 0.711 and body S@5 0.8 vs 0.4 (before the full-text channel). Identifier and project-affinity queries were unaffected without embeddings.
A plain word-overlap ranking over full note files scored body 1.000 versus recall's 0.456, because lexical text and embeddings cover only the projection. That gap, not vectors, was the actionable finding.

## Rejected follow-ups

- A paraphrase/zero-overlap eval kind: brittle (forces unnatural queries, breaks on fixture or tokenizer edits), Ollama scores are model-dependent and cannot gate CI, and 15-20 queries is too noisy. Per-query comparison of existing runs answered the question instead.
- Removing embeddings or adopting an agentic-only design: the eval contradicts it for this workload.

## Open

The metadata prior (0.012) exceeding single-channel RRF rank gaps (~0.003) remains the deferred wave-1 fusion-policy decision; it also caps how far a full-text-only match can rise.
