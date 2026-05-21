---
title: Multi-provider embedding support — plan and research (consolidated)
tags:
  - embeddings
  - architecture
  - providers
  - completed
lifecycle: permanent
createdAt: '2026-05-21T21:17:30.202Z'
updatedAt: '2026-05-21T21:17:30.202Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: implementation-principles-for-mnemonic-mcp-2e178bba
    type: related-to
  - id: typescript-code-review-mnemonic-project-961d984b
    type: related-to
  - id: apply-multi-provider-embedding-support-implementation-f55f935a
    type: follows
memoryVersion: 1
---
# Multi-provider Embedding Support — Plan and Research (Consolidated)

## Research: Provider API Architecture

Mnemonic previously hard-coded Ollama for embeddings. Supporting multiple providers required an abstraction layer with explicit provider/model/dimension identity so vectors from incompatible embedding spaces are never compared.

### Provider APIs

- **Ollama**: `POST /api/embed` with `{ model, input, truncate: true }` — local/private network only, no API key. Default model: `nomic-embed-text-v2-moe`.
- **OpenAI-compatible**: `POST /v1/embeddings` with `Authorization: Bearer`, `{ model, input, encoding_format: "float", dimensions? }`. This is a transport/schema interoperability layer, not a semantic compatibility guarantee. Covers LiteLLM, LM Studio, vLLM, Ollama OpenAI compatibility mode.
- **OpenAI native**: Same transport as `openai-compatible` but defaults to `text-embedding-3-small` and uses `OPENAI_API_KEY`/`OPENAI_BASE_URL`. API data not used for training by default, but still external.
- **Gemini**: `POST /v1beta/models/{model}:embedContent` with `x-goog-api-key`. Default model: `gemini-embedding-2`. Supports flexible output dimensions 128–3072. Embedding spaces between `gemini-embedding-001` and `gemini-embedding-2` are incompatible. Text-only initially.

### Design Decision: Compatibility Boundary

`model` alone is insufficient as a cache key — `text-embedding-3-large` at 3072d is incompatible with itself at 1024d. The compatibility key includes: provider mode, model, dimensions, metric, and optional input mode. Base URL is NOT included — users must force rebuild if endpoint changes model semantics behind the same alias.

### Implementation

All 8 phases completed: provider abstraction (branded types, discriminated unions), embedding record metadata, safe comparison guards (dimension mismatch skip), OpenAI-compatible/OpenAI/Gemini providers, configuration docs, provider-switch UX via `sync(force: true)`, and full TypeScript review/security audit. 926 tests pass.

### Key Constraints

- Provider config is process-environment only, never persisted to vaults or git.
- API keys only appear in request headers; never in errors, output, logs, or stored state.
- Ollama remains default for existing users.
- External providers send projection text externally — documented as privacy tradeoff.
- Changing provider/model/dimensions requires `sync(force: true)`.
- SDK-free: uses direct `fetch` to avoid mandatory dependencies.
- No vector DB, no multimodal, no batching, no background reindex daemon.
dex daemon.
