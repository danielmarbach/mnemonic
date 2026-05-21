---
title: 'Apply: Multi-provider embedding support implementation'
tags:
  - workflow
  - apply
  - embeddings
  - providers
lifecycle: temporary
createdAt: '2026-05-21T11:10:06.885Z'
updatedAt: '2026-05-21T11:10:39.974Z'
role: context
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: plan-multi-provider-embedding-support-for-mnemonic-fa944256
    type: follows
  - id: review-multi-provider-embedding-support-implementation-0ff11f18
    type: derives-from
memoryVersion: 1
---
# Apply: Multi-provider Embedding Support Implementation

Implemented multi-provider embedding support for mnemonic across Ollama, OpenAI-compatible endpoints, native OpenAI, and native Gemini while keeping provider configuration environment-only and API keys out of persisted storage.

## What Changed

- Added embedding provider identity types and provider config resolution for `ollama`, `openai-compatible`, `openai`, and `gemini`.
- Preserved Ollama as the default provider with private-network URL validation scoped to `OLLAMA_URL`.
- Added OpenAI-compatible transport using `POST /v1/embeddings`, optional bearer auth, `encoding_format: "float"`, and optional `dimensions`.
- Added native OpenAI defaults on the same transport: `text-embedding-3-small`, `OPENAI_API_KEY`, and `OPENAI_BASE_URL`.
- Added native Gemini transport using `POST /v1beta/models/{model}:embedContent`, `x-goog-api-key`, text-only content parts, and optional `outputDimensionality`.
- Extended local embedding records with non-secret compatibility metadata: provider, dimensions, metric, optional input mode, and compatibility key.
- Added compatibility guards before semantic comparisons in recall, consolidate, and project memory summary paths.
- Changed `cosineSimilarity` to reject mismatched vector lengths instead of silently padding.
- Added provider-switch rebuild coverage proving `sync` with `force: true` rewrites embeddings under the new provider identity.
- Updated README, AGENT.md, homepage, and changelog with provider configuration, privacy, and `sync` MCP-tool wording.

## Security Properties

- Provider API keys are read from process environment only.
- API keys are not written to notes, embedding records, vault config, structured output, text output, or git.
- Provider error messages include provider, model, status, and endpoint host but not API key values.
- Docs state that Ollama keeps projection text local, while OpenAI-compatible cloud proxies, OpenAI, and Gemini send projection text externally.

## Review Fixes

- Rejected empty provider vectors at Zod response boundaries.
- Updated embedding-record validation to reject empty vectors consistently.
- Tightened compatibility checks so provider/model identity is always validated and dimensions are enforced when configured or when an expected vector length is available.

## Validation

- `rtk npm run build` passed.
- `npm test -- tests/embeddings.unit.test.ts tests/recall-embeddings.integration.test.ts tests/sync-migrations.integration.test.ts` passed: 3 files, 61 tests.
- Full `npm test` passed: 54 files, 926 tests.
- Fresh TypeScript/security review task `ses_1b5caea5bffeIfORpSmWhm1IKp` completed; two medium findings were fixed before final commit.

## Commits

- `83d5676` Add embedding provider identity guard
- `ce5779c` Add OpenAI embedding providers
- `34d490c` Add Gemini embedding provider
- `186d307` Verify provider switch embedding rebuilds
- `34ca728` Document embedding provider configuration
- `e4b9e60` Harden embedding provider validation
