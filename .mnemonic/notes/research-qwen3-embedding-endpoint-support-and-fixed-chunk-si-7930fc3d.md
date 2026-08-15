---
title: 'Research: qwen3-embedding endpoint support and fixed chunk size'
tags:
  - workflow
  - research
  - embeddings
  - chunking
lifecycle: temporary
createdAt: '2026-08-15T11:04:13.699Z'
updatedAt: '2026-08-15T11:06:18.329Z'
role: research
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: rpir-request-qwen3-embedding-endpoints-and-chunk-size-restri-6f294f65
    type: derives-from
memoryVersion: 1
---
Verified DeepSeek's claims against code at commit d337c47.

## Claim 1: endpoints — mostly FALSE for practical qwen3 usage

mnemonic speaks exactly three endpoint shapes (`src/embeddings.ts`): Ollama `POST /api/embed` (`{model,input,truncate:true}`), OpenAI-compatible `POST {base}/v1/embeddings` (`encoding_format:float`, optional `dimensions` + bearer key), Gemini `:embedContent`.

All qwen3-embedding sizes (0.6B=1024d, 4B=2560d, 8B=4096d) are served through these shapes:

- Local Ollama: only `EMBED_MODEL` needs to change (e.g. `qwen3-embedding:4b`); `/api/embed` is size-agnostic.
- Remote (vLLM, LM Studio, SiliconFlow, DashScope compatible-mode, remote Ollama `/v1/embeddings`): `EMBED_PROVIDER=openai-compatible` + `EMBED_BASE_URL`; this provider has no host restriction and an optional API key.

No client-side dimension cap exists (`EmbeddingDimensions` is a branded number with positive-int validation only). Model switches invalidate old vectors via compatibility-key skip; `sync {force:true}` rebuilds. Vault note `embedding-model-selection-and-compatibility-4d870300` already benchmarked `qwen3-embedding:0.6b` through `/api/embed` as fully compatible.

Genuine restrictions (all models, not qwen-specific): `OLLAMA_URL` is guarded to localhost/private networks (SSRF protection by design — remote Ollama must go through `openai-compatible`); `EMBED_DIMENSIONS` is ignored by the Ollama provider (Ollama `/api/embed` has no dimensions parameter upstream); Azure-style/Cohere-style/HF-TEI-native endpoint shapes unsupported (OpenAI-compatible gateways cover those deployments).

## Claim 2: fixed chunk size — TRUE

`src/markdown-chunker.ts` hardcodes `MAX_CHUNK_CHARS=4000` for document-source chunks; note embeddings embed a projection capped at 1200 chars (`src/projections.ts`). Nothing scales with model context, so README's "larger context window for longer notes" claim for qwen3-embedding is unrealized at runtime.

Invalidation constraint: manifest `chunkerVersion` is the only config signal checked (`isGenerationCurrent` in `src/document-sync.ts`; `document-lazy-load.ts` compares `manifest.chunkerVersion`; `chunkerOptionsHash` is hardcoded `"default"`). Any configurable chunk size MUST be encoded into `chunkerVersion`, otherwise stale generations are reused with wrong chunk boundaries.

## Fix direction

1. `EMBED_MAX_CHUNK_CHARS` env (default 4000, validated 200..100000) with `createMarkdownChunker(maxChars)` factory; `chunkerVersion` stays `"2"` at default (backward compatible) and becomes `2:<chars>` when overridden so generations invalidate correctly.
2. Correct docs: README qwen paragraph, env tables (README/AGENT.md/docs/index.html), ARCHITECTURE.md, CHANGELOG; document remote-endpoint guidance (openai-compatible for remote Ollama etc.).
