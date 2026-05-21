---
title: 'Research: Multi-provider embedding support for mnemonic'
tags:
  - workflow
  - research
  - embeddings
  - architecture
lifecycle: temporary
createdAt: '2026-05-21T10:30:50.766Z'
updatedAt: '2026-05-21T10:30:50.766Z'
role: research
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
# Research: Multi-provider Embedding Support For Mnemonic

Mnemonic currently treats embeddings as a single Ollama-backed capability. Supporting OpenAI and Gemini should introduce an embedding-provider abstraction, explicit provider/model/dimension identity, and safe reindex behavior so vectors from incompatible embedding spaces are never compared accidentally.

## Current Architecture Findings

- `src/embeddings.ts` hard-codes Ollama: `OLLAMA_URL`, `EMBED_MODEL`, `/api/embed`, `{ model, input, truncate: true }`, Ollama response parsing, `OllamaUrlError`, and `OllamaEmbeddingError`.
- The exported API is only `embed(text): Promise<number[]>`, `cosineSimilarity(a, b)`, and `embedModel`.
- Write paths import `embed` and `embedModel` directly: `remember`, `update`, `consolidate`, `helpers/embed`, and persistence status reporting.
- `EmbeddingRecord` stores only `{ id, model, embedding, updatedAt }`. It does not store provider, dimensions, endpoint/base URL, task type, or model-family compatibility.
- Reindex/backfill skips existing embeddings when `existing.model === embedModel && existing.updatedAt >= note.updatedAt`.
- `recall`, `project_memory_summary`, and `consolidate` compute cosine similarity across loaded embedding records without checking dimension or provider compatibility.
- `cosineSimilarity` silently treats missing dimensions as zero because it loops over `a.length` and uses `b[i] ?? 0`; this can hide mismatched vector dimensions.
- Embeddings are local-only JSON files under `embeddings/`, gitignored, and rebuilt by `sync`; notes/projections are independent of embedding storage.
- README and `compose.yaml` assume Ollama as a prerequisite and runtime service.

## Provider API Findings

### Ollama

- Current implementation uses local/private `OLLAMA_URL` validation and no API key.
- Request: `POST /api/embed` with `{ model, input, truncate: true }`.
- Response shape used today: `{ embeddings: number[][] }`.
- Default model is `nomic-embed-text-v2-moe`; `qwen3-embedding:0.6b` is documented as an alternative.

### OpenAI

- Endpoint: `POST https://api.openai.com/v1/embeddings`.
- Authentication: `Authorization: Bearer $OPENAI_API_KEY`.
- Request includes `model`, `input`, and optionally `encoding_format: "float"` and `dimensions` for v3 models.
- Response shape contains `data[0].embedding`, `model`, and `usage` token counts.
- `text-embedding-3-small` defaults to 1536 dimensions; `text-embedding-3-large` defaults to 3072 dimensions.
- Both v3 models support a `dimensions` parameter for shortening embeddings.
- OpenAI docs recommend cosine similarity; OpenAI embeddings are normalized to length 1.
- Max input for current v3 embedding models is documented as 8192 tokens.
- OpenAI's announcement says API data is not used for training by default, but this is still an external data transfer and should be documented as a privacy/security tradeoff.

### Gemini

- REST endpoint pattern: `https://generativelanguage.googleapis.com/v1beta/models/{model}:embedContent`.
- Authentication: `x-goog-api-key: $GEMINI_API_KEY`.
- Current stable model in docs: `gemini-embedding-2`; older model: `gemini-embedding-001`.
- `gemini-embedding-2` supports text, image, video, audio, and PDF inputs, but mnemonic should initially use text-only projection content.
- `gemini-embedding-2` input token limit is documented as 8192; `gemini-embedding-001` is 2048.
- Gemini supports flexible output dimensions from 128 to 3072, with recommended 768, 1536, or 3072.
- Gemini docs explicitly state embedding spaces between `gemini-embedding-001` and `gemini-embedding-2` are incompatible and all data must be re-embedded when upgrading.
- For `gemini-embedding-2`, `task_type` is not supported; instructions should be included directly in prompts for task-specific text use cases.
- For reduced dimensions, Gemini docs note normalization behavior differs by model/version.

## Design Implications

- `model` alone is not enough as a cache key because `text-embedding-3-large` with `dimensions: 1024` is not compatible with the same model at 3072 dimensions.
- Provider identity must be part of the embedding compatibility check because identical model strings could theoretically exist across providers or custom endpoints.
- Dimension count should be recorded and enforced at comparison time.
- External providers need secret-bearing configuration. API keys should come from environment variables, not vault config committed to git.
- Provider base URLs should be configurable for tests and OpenAI-compatible endpoints, but Ollama's private-network URL validation should remain provider-specific rather than applied to all providers.
- Existing embeddings can remain readable, but should be treated as legacy Ollama records. A migration/backfill strategy should prevent mixed-provider recall quality bugs.
- Because vectors are local-only and gitignored, changing embedding providers is primarily a local reindex concern, not a shared note migration.
- Tests need provider fake servers with distinct request/response validation, not only the existing Ollama-shaped fake `/api/embed` server.

## Recommended Architecture

- Introduce `EmbeddingProvider` interface with `embed(text): Promise<EmbeddingResult>` and `identity` metadata.
- Introduce an embedding config resolver, likely in `src/embeddings.ts` or a new `src/embedding-providers.ts`, that maps environment/config to one provider.
- Suggested provider selection: `EMBED_PROVIDER=ollama|openai|gemini`, defaulting to `ollama` to preserve current behavior.
- Suggested env vars: `EMBED_MODEL`, `EMBED_DIMENSIONS`, `OLLAMA_URL`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `GEMINI_API_KEY`, `GEMINI_BASE_URL`.
- Suggested identity: `{ provider, model, dimensions?, compatibilityKey }`, where `compatibilityKey` is serialized into embedding records and used for skip/compare checks.
- Keep `embed(text)` as a facade initially to minimize call-site churn, but have it return or pair with metadata so write paths record the resolved identity.
- Make `cosineSimilarity` reject or skip dimension mismatch instead of silently padding.

## Risks And Open Questions

- If `recall` embeds the query with one provider but existing note embeddings were generated with another provider, current code would compare incompatible spaces. The plan must block or skip incompatible records and route to `sync(force: true)`.
- Provider rate limits and cost mean `reindexEmbedConcurrency` should remain configurable and perhaps provider-specific defaults should be lower for external APIs.
- Text length/token limits are provider/model-specific. Current projection max of 1200 chars probably keeps notes under limits, but raw fallback could exceed limits for long notes.
- API dependencies are optional. A direct `fetch` implementation avoids mandatory SDK dependencies and keeps package size small, but SDKs may improve future compatibility.
- Gemini's multimodal support is out of scope for initial mnemonic note embeddings; adding it would require changing projection/input abstractions.
- Privacy wording must change: docs currently say embeddings are generated locally and nothing is sent to cloud providers. That remains true only for `ollama`.
