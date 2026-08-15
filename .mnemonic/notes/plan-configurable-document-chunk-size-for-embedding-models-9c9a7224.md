---
title: 'Plan: configurable document chunk size for embedding models'
tags:
  - workflow
  - plan
  - apply
lifecycle: temporary
createdAt: '2026-08-15T11:07:16.607Z'
updatedAt: '2026-08-15T11:36:30.706Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: rpir-request-qwen3-embedding-endpoints-and-chunk-size-restri-6f294f65
    type: derives-from
  - id: research-qwen3-embedding-endpoint-support-and-fixed-chunk-si-7930fc3d
    type: derives-from
memoryVersion: 1
---
Plan for RPIR request `rpir-request-qwen3-embedding-endpoints-and-chunk-size-restri-6f294f65` (handoff pre-authorized by user: "investigate, plan and fix"). Research: `research-qwen3-embedding-endpoint-support-and-fixed-chunk-si-7930fc3d`.

## Steps

- [x] 1. `src/markdown-chunker.ts`: export `DEFAULT_MAX_CHUNK_CHARS = 4000`; add `resolveMaxChunkChars(env = process.env)` reading `EMBED_MAX_CHUNK_CHARS` (integer, 200..100000, else `EmbeddingConfigurationError`); add `createMarkdownChunker(maxChunkChars)` factory; `chunkerVersion` = `"2"` at default (backward compatible) else `2:<chars>`; `markdownChunker` singleton = `createMarkdownChunker(resolveMaxChunkChars())`; thread max through `splitOversizedContent`.
- [x] 2. `tests/markdown-chunker.unit.test.ts`: resolveMaxChunkChars (default/valid/non-integer/below-floor/above-ceiling); createMarkdownChunker identity (default version `"2"`, custom `2:8000`); custom small max splits paragraphs into smaller chunks; single oversized paragraph stays one chunk.
- [x] 3. Docs: README (rewrite qwen3-embedding paragraph: chunk default 4000 chars, `EMBED_MAX_CHUNK_CHARS` lever for long-context models; notes embed bounded 1200-char projections; add remote-endpoint guidance via `EMBED_PROVIDER=openai-compatible`), env table row in README + AGENT.md, ARCHITECTURE.md chunker mention, docs/index.html config table, CHANGELOG `[Unreleased]` Added entry.
- [x] 4. Validation: typecheck + lint + full test suite green; MCP contract snapshots untouched.
- [ ] 5. Scope change (user-endorsed after review: "I'm ok to bump the chunker version"): bump default `chunkerVersion` `"2"` -> `"3"` (custom: `3:<chars>`); route intro-before-first-heading through `splitOversizedContent` behind the existing `MIN_CHUNK_CHARS` gate; update version assertions to `"3"`/`"3:8000"`; add tests for oversized-intro splitting (custom ceiling and default) and small-intro single chunk; CHANGELOG `[Unreleased]` Changed entry.

## Constraints

- C1 Default behavior byte-identical: unset env → version `"2"`, 4000-char chunks; existing generations must NOT invalidate. (Superseded for the intro path by step 5 / C8; the original C1 change shipped and was verified byte-identical in commit 7179557.)
- C2 Non-default size must change `chunkerVersion` (isGenerationCurrent in src/document-sync.ts and manifest check in src/document-lazy-load.ts are the only invalidation signals; chunkerOptionsHash is inert "default").
- C3 Invalid env fails fast with `EmbeddingConfigurationError`, actionable message.
- C4 No MCP tool schema changes.
- C5 Docs synchronized (README/AGENT.md/ARCHITECTURE.md/docs/index.html) + CHANGELOG brief entry.
- C6 OLLAMA_URL localhost/private guard unchanged; remote serving documented via openai-compatible.
- C7 npm test / lint / typecheck pass.
- C8 (step 5) The version bump to `"3"` intentionally invalidates existing document generations once on the next sync; intros below MIN_CHUNK_CHARS are still dropped; intros between MIN_CHUNK_CHARS and the ceiling remain a single chunk with unchanged chunkId; only oversized intros change. All other splitting behavior stays identical to v2.

## Deliverables

src/markdown-chunker.ts; tests/markdown-chunker.unit.test.ts; README.md; AGENT.md; ARCHITECTURE.md; docs/index.html; CHANGELOG.md (step 5 adds: src/markdown-chunker.ts, tests/markdown-chunker.unit.test.ts, CHANGELOG.md).
