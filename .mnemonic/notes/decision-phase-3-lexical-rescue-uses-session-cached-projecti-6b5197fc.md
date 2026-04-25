---
title: 'Decision: Phase 3 lexical rescue uses session-cached projection tokens'
tags:
  - workflow
  - decision
  - phase3
  - recall
  - tfidf
  - lexical-cache
lifecycle: permanent
createdAt: '2026-04-25T10:44:41.682Z'
updatedAt: '2026-04-25T10:44:41.682Z'
role: decision
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
# Decision: Phase 3 lexical rescue uses session-cached projection tokens

Phase 3 adopts pre-tokenized TF-IDF corpus preparation for lexical rescue by caching projection tokens in the active session cache and reusing them when projection text is unchanged.

## Why

- Lexical rescue previously re-tokenized projection text for all rescue candidates on each run.
- Session cache already exists for notes/embeddings/projections, so this extends the same file-first in-memory strategy without adding persistent artifacts.

## Decision

- Store projection tokens in session cache keyed by `vaultPath::noteId`.
- Include projection text snapshot in the cache entry; reuse tokens only when text matches exactly.
- Build rescue TF-IDF prepared corpus from pre-tokenized documents and pass it into ranking.

## Guardrails

- No scoring-model change in this phase: ranking behavior remains equivalent.
- Cache is session-scoped and invalidated with active project cache invalidation.
- If cache misses or projection text changed, tokenize on demand and repopulate cache.

## Consequences

- Reduces repeated tokenization overhead on repeated recall operations.
- Keeps rescue behavior deterministic and fail-soft.
