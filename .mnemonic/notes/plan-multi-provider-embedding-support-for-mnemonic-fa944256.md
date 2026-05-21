---
title: 'Plan: Multi-provider embedding support for mnemonic'
tags:
  - workflow
  - plan
  - embeddings
  - architecture
lifecycle: temporary
createdAt: '2026-05-21T10:31:35.612Z'
updatedAt: '2026-05-21T10:33:30.762Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: research-request-multi-provider-embedding-support-for-mnemon-a4a5d2fa
    type: derives-from
  - id: research-multi-provider-embedding-support-for-mnemonic-4c2dc9b6
    type: derives-from
memoryVersion: 1
---
# Plan: Multi-provider Embedding Support For Mnemonic

## Intent

Support Ollama, OpenAI, and Gemini embedding providers without comparing incompatible embedding spaces or leaking API secrets into committed vault files.

## Research Inputs

- Request: `research-request-multi-provider-embedding-support-for-mnemon-a4a5d2fa`
- Research: `research-multi-provider-embedding-support-for-mnemonic-4c2dc9b6`

## Guiding Constraints

- Preserve Ollama as the default provider for existing users.
- Do not store API keys in notes, embeddings, project vaults, or git-committed config.
- Treat provider/model/dimensions as the embedding compatibility boundary.
- Never compare query embeddings against note embeddings from a different compatibility key.
- Keep provider implementations SDK-free initially unless a direct REST integration becomes brittle.
- Keep external-provider docs explicit about privacy, cost, and rate-limit tradeoffs.

## Phase 1: Provider Abstraction And Identity

- \[ ] Add `EmbeddingProvider` and `EmbeddingResult` types.
- \[ ] Add `EmbeddingIdentity` with provider, model, dimensions, and compatibility key.
- \[ ] Refactor `src/embeddings.ts` so Ollama is one provider behind the abstraction.
- \[ ] Preserve exported `embed(...)` and `embedModel`-equivalent facade initially, or replace with minimal call-site changes if cleaner.
- \[ ] Rename generic errors away from Ollama-only names where behavior is no longer provider-specific.
- \[ ] Keep Ollama URL private-network validation only in the Ollama provider.

## Phase 2: Embedding Record Compatibility Metadata

- \[ ] Extend `EmbeddingRecord` and `EmbeddingRecordSchema` with optional `provider`, `dimensions`, and `compatibilityKey` fields.
- \[ ] Treat records without provider metadata as legacy Ollama records using model-only compatibility.
- \[ ] Store the vector length as `dimensions` when writing embeddings.
- \[ ] Update skip logic in `embedMissingNotes` from `existing.model === embedModel` to compatibility-key match plus timestamp freshness.
- \[ ] Update persistence status to report provider/model/dimensions compactly.
- \[ ] Decide whether to bump vault schema. Initial recommendation: no required migration because embeddings are local-only and optional fields can be backfilled on rebuild.

## Phase 3: Safe Similarity Comparisons

- \[ ] Add a compatibility guard used by `recall`, `consolidate`, and `project_memory_summary` before cosine similarity.
- \[ ] Skip incompatible embeddings and surface compact warnings such as `3 embeddings skipped: provider/model/dimensions mismatch; run sync(force: true)`.
- \[ ] Make cosine similarity dimension-safe: either throw on mismatch in low-level helper or return a typed skip result in callers. Initial recommendation: low-level helper should require equal lengths; callers handle skip.
- \[ ] Add tests that prove mixed-provider and mixed-dimension embeddings are not compared.

## Phase 4: OpenAI And OpenAI-Compatible Providers

- \[ ] Add native `openai` provider selected by `EMBED_PROVIDER=openai`.
- \[ ] Add `openai-compatible` provider selected by `EMBED_PROVIDER=openai-compatible` for LiteLLM, LM Studio, vLLM, Ollama OpenAI compatibility, and similar servers.
- \[ ] Support `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `EMBED_MODEL`, and optional `EMBED_DIMENSIONS` for native OpenAI.
- \[ ] Support provider-neutral compatible vars such as `EMBED_BASE_URL` and `EMBED_API_KEY`, or document use of `OPENAI_BASE_URL`/`OPENAI_API_KEY` for compatible endpoints.
- \[ ] Default OpenAI model should be `text-embedding-3-small` when provider is OpenAI and no model is specified.
- \[ ] Do not assume a default model for `openai-compatible`; require `EMBED_MODEL` because local/proxy model names vary.
- \[ ] Request `POST /v1/embeddings` with `Authorization: Bearer` when an API key is set, `input`, `model`, `encoding_format: "float"`, and `dimensions` when set.
- \[ ] Parse `data[0].embedding` and validate numeric vector output.
- \[ ] Include non-secret error context: provider, model, status code, and endpoint host, but never API key.
- \[ ] Add unit tests using fake OpenAI-compatible servers validating headers, body, response parsing, base URL behavior, optional auth, and failure messages.

- \[ ] Add `openai` provider selected by `EMBED_PROVIDER=openai`.
- \[ ] Support `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `EMBED_MODEL`, and optional `EMBED_DIMENSIONS`.
- \[ ] Default OpenAI model should be `text-embedding-3-small` when provider is OpenAI and no model is specified.
- \[ ] Request `POST /v1/embeddings` with `Authorization: Bearer`, `input`, `model`, `encoding_format: "float"`, and `dimensions` when set.
- \[ ] Parse `data[0].embedding` and validate numeric vector output.
- \[ ] Include non-secret error context: provider, model, status code, and endpoint host, but never API key.
- \[ ] Add unit tests using a fake OpenAI-compatible server validating headers, body, response parsing, and failure messages.

## Phase 5: Gemini Provider

- \[ ] Add `gemini` provider selected by `EMBED_PROVIDER=gemini`.
- \[ ] Support `GEMINI_API_KEY`, `GEMINI_BASE_URL`, `EMBED_MODEL`, and optional `EMBED_DIMENSIONS`.
- \[ ] Default Gemini model should be `gemini-embedding-2` when provider is Gemini and no model is specified.
- \[ ] Request `POST /v1beta/models/{model}:embedContent` with `x-goog-api-key`.
- \[ ] For text-only mnemonic projections, send content parts as text and do not expose multimodal support initially.
- \[ ] Pass provider-specific output dimension parameter when configured.
- \[ ] Parse `embedding.values` or documented equivalent response shape, with tests pinned to the REST shape used.
- \[ ] Add tests using a fake Gemini server validating headers, model path, body, response parsing, and failure messages.

## Phase 6: Configuration And Documentation

- \[ ] Update README prerequisites so Ollama is the default local path, not the only path.
- \[ ] Update configuration table with `EMBED_PROVIDER`, provider-specific API key vars, provider base URL vars, `EMBED_MODEL`, and `EMBED_DIMENSIONS`.
- \[ ] Update privacy FAQ: Ollama is local; OpenAI/Gemini send projection text to external APIs.
- \[ ] Update `compose.yaml` comments or env examples without forcing external API keys into compose defaults.
- \[ ] Document provider switching: run `sync(force: true)` after changing provider/model/dimensions.
- \[ ] Document recommended concurrency for external APIs and rate-limit/cost implications.

## Phase 7: Reindex And Operational UX

- \[ ] Make `sync(force: true)` the official provider-switch rebuild path.
- \[ ] Consider a startup or read-path warning when many embeddings exist but no compatible embeddings are found.
- \[ ] Keep normal `sync` backfill behavior: missing or stale incompatible embeddings are rebuilt under the current provider identity.
- \[ ] Ensure provider failures remain fail-soft where they are already fail-soft, but surface actionable reasons.

## Phase 8: Validation

- \[ ] Add focused unit tests for provider config resolution.
- \[ ] Add provider HTTP tests for Ollama, OpenAI, and Gemini.
- \[ ] Add storage validation tests for old and new embedding record shapes.
- \[ ] Add recall/consolidate/project summary tests for compatibility filtering.
- \[ ] Add integration tests proving `remember`, `update`, `sync`, and `recall` work under each provider using fake servers.
- \[ ] Run `npm run build` and `npm test`.

## Non-goals For First Implementation

- No vector database integration.
- No Gemini multimodal note embeddings.
- No automatic cloud-provider selection.
- No API key storage in mnemonic config files.
- No cross-model vector translation or partial reuse of old vectors.
- No batching API integration in the first pass.

## Open Decisions Before Implementation

- Should `openai-compatible` become the recommended advanced path, with native `gemini` documented mainly for users who do not want to run LiteLLM or another proxy? Initial recommendation: yes.
- Should compatibility metadata include task/input mode, e.g. `search_document` versus `search_query`, for providers that support asymmetric embeddings? Initial recommendation: include an optional `inputMode`/`taskType` field in the compatibility key once exposed.

- Should `EMBED_MODEL` remain provider-neutral, or should provider-specific env vars like `OPENAI_EMBED_MODEL` override it?
- Should incompatible embeddings be immediately rebuilt during `recall`, or only skipped with a warning and rebuilt by `sync`? Initial recommendation: allow existing `embedMissingNotes` to rebuild before recall, but still skip any incompatible records that remain.
- Should `compatibilityKey` include provider base URL? Initial recommendation: include provider, model, and dimensions, but not base URL, because OpenAI-compatible endpoints may intentionally serve the same model identity from different hosts.
- Should `dimensions` be required in records? Initial recommendation: optional for legacy reads, required for new writes.

## Implementation Order Recommendation

1. Provider abstraction while preserving current Ollama behavior.
2. Compatibility metadata and comparison guards.
3. OpenAI-compatible provider using `/v1/embeddings`.
4. Native OpenAI defaults layered on the same transport.
5. Native Gemini provider for direct Gemini API users.
6. Documentation and provider-switch UX.
7. Full integration coverage and dogfood with `sync(force: true)`.

1) Provider abstraction while preserving current Ollama behavior.
2) Compatibility metadata and comparison guards.
3) OpenAI provider.
4) Gemini provider.
5) Documentation and provider-switch UX.
6) Full integration coverage and dogfood with `sync(force: true)`.
