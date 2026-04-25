---
title: 'Apply: Phase 3 lexical rescue pre-tokenized TF-IDF cache integration'
tags:
  - workflow
  - apply
  - phase3
  - recall
  - tfidf
  - lexical-cache
lifecycle: temporary
createdAt: '2026-04-25T10:33:29.411Z'
updatedAt: '2026-04-25T10:33:29.411Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
# Apply: Phase 3 lexical rescue pre-tokenized TF-IDF cache integration

## Goal

Reduce lexical rescue overhead by avoiding repeated projection tokenization while preserving existing recall behavior.

## Scope

- Add session-level projection token cache keyed by `vaultPath::noteId`.
- Reuse cached projection tokens during lexical rescue candidate collection.
- Build prepared TF-IDF corpus from pre-tokenized documents.
- Keep rescue ranking behavior unchanged.

## Code changes

### `src/lexical.ts`

- Exported `PreparedTfIdfDocument`.
- Added `prepareTfIdfCorpusFromTokenizedDocuments(documents)`.
- Refactored `prepareTfIdfCorpus(documents)` to tokenize once and delegate to the new helper.

### `src/cache.ts`

- Added `projectionTokensByKey` to `SessionProjectCache`.
- Added `getSessionCachedProjectionTokens(projectId, vaultPath, noteId, projectionText)`.
- Added `setSessionCachedProjectionTokens(projectId, vaultPath, noteId, projectionText, tokens)`.
- Wired token cache initialization and invalidation into cache lifecycle.

### `src/index.ts`

- `collectLexicalRescueCandidates` now:
  - reads projection tokens from session cache when available;
  - tokenizes projection text only on cache miss;
  - writes tokens back into session cache;
  - builds prepared corpus via `prepareTfIdfCorpusFromTokenizedDocuments`;
  - passes prepared corpus into `rankDocumentsByTfIdf`.

## Tests added first (TDD red)

- `tests/lexical.unit.test.ts`
  - `reuses pre-tokenized documents without changing ranking behavior`.
- `tests/cache.unit.test.ts`
  - stores/retrieves projection tokens when text matches;
  - returns undefined when projection text changed;
  - projection token cache clears on invalidation;
  - token setter is no-op without active cache.

## Notes

- This phase intentionally keeps scoring semantics unchanged and focuses on precomputed token reuse in the lexical rescue path.
