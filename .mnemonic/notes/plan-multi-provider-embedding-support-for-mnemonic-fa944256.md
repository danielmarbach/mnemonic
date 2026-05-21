---
title: 'Plan: Multi-provider embedding support for mnemonic'
tags:
  - workflow
  - plan
  - embeddings
  - architecture
lifecycle: temporary
createdAt: '2026-05-21T10:31:35.612Z'
updatedAt: '2026-05-21T11:10:12.915Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: research-request-multi-provider-embedding-support-for-mnemon-a4a5d2fa
    type: derives-from
  - id: research-multi-provider-embedding-support-for-mnemonic-4c2dc9b6
    type: derives-from
  - id: implementation-principles-for-mnemonic-mcp-2e178bba
    type: related-to
  - id: typescript-code-review-mnemonic-project-961d984b
    type: related-to
  - id: apply-multi-provider-embedding-support-implementation-f55f935a
    type: follows
memoryVersion: 1
---
# Plan: Multi-provider Embedding Support For Mnemonic

## Intent

Support Ollama, OpenAI-compatible endpoints, native OpenAI, and native Gemini embedding providers without comparing incompatible embedding spaces, adding hidden I/O regressions, or leaking API secrets into committed files.

## Research Inputs

- Request: `research-request-multi-provider-embedding-support-for-mnemon-a4a5d2fa`
- Research: `research-multi-provider-embedding-support-for-mnemonic-4c2dc9b6`
- Design constraints: `implementation-principles-for-mnemonic-mcp-2e178bba`
- TypeScript review constraints: `typescript-code-review-mnemonic-project-961d984b` and `.agents/skills/typescript-code-review/SKILL.md`

## Hard Project Constraints

## Testing Strategy

Use hermetic fake HTTP providers and real local MCP integration tests. Manual verification is useful for dogfooding but is not sufficient acceptance criteria.

### Unit Tests

- Provider config resolver tests for env combinations, defaults, invalid values, and missing secrets.
- Provider identity and compatibility-key tests for provider/model/dimensions/metric/input mode changes.
- Zod response parser tests for Ollama, OpenAI-compatible/OpenAI, and Gemini success and malformed responses.
- `cosineSimilarity` and compatibility guard tests for dimension mismatch and incompatible vector spaces.
- Storage validation tests for legacy embedding records and new metadata-bearing records.

### Fake HTTP Provider Tests

- Continue using fake local HTTP servers, but generalize beyond the current Ollama-only `startFakeEmbeddingServer`.
- Add provider-specific fake servers or a configurable fake server that can assert request path, headers, body, and auth behavior.
- Fake OpenAI-compatible server must verify `/v1/embeddings`, optional bearer auth, `encoding_format`, `dimensions`, and `data[0].embedding` parsing.
- Fake Gemini server must verify model path, `x-goog-api-key`, text content shape, output dimensionality parameter, and `embedding.values` parsing.
- Tests must assert no API key appears in thrown errors, structured output, or text output.

### MCP Integration Tests

- Use the real local MCP entrypoint with temp `VAULT_PATH`, `DISABLE_GIT=true` unless git behavior is under test, and fake embedding endpoints.
- Add at least one remember/recall integration flow for `ollama`, `openai-compatible`, and `gemini`.
- Add provider-switch integration coverage: create embeddings with one compatibility key, switch config, and prove recall does not compare incompatible stored vectors.
- Add `sync(force: true)` integration coverage proving incompatible or stale embeddings are rebuilt under the current provider identity.
- If structured output changes, add schema-audit integration tests that parse real MCP `structuredContent` through exported Zod schemas and assert compact text rendering.

### What Not To Do

- Do not require real Ollama, OpenAI, Gemini, LiteLLM, LM Studio, or vLLM in CI.
- Do not rely on manual API calls as validation for request/response shape.
- Do not add live cloud-provider tests to the default suite because they require secrets, network, money, and provider availability.
- Optional live smoke scripts may be documented for maintainers, but they are not release gates.

### Manual Dogfood

- After automated tests pass, manually dogfood one local provider path, preferably Ollama or an OpenAI-compatible local proxy if available.

- Treat dogfood as confidence building for docs and UX, not as a substitute for hermetic automated tests.

- Preserve mnemonic as a file-first, git-backed MCP memory server: no database, no daemon, no always-on embedding service requirement.

- Keep embeddings local-only files under `embeddings/`, gitignored, and always recomputable.

- Do not store API keys in notes, embedding records, project vaults, or git-committed config.

- Do not add new I/O to cold/fallback diagnostic paths. If needed data is not already in memory, omit the diagnostic or reuse existing cache-loading paths intentionally.

- Fail soft for optional diagnostics and compatibility warnings: return optional fields or compact warnings instead of throwing from read paths.

- New structured output fields require exported TypeScript types, Zod schema fields with `.describe()`, tool `Returns` description updates, text rendering, and integration tests parsing real MCP responses through exported schemas.

- When tool behavior/docs change, keep AGENT.md, README.md, and `docs/index.html` synchronized.

- Preserve compact tool-description style; add only load-bearing wording.

## Hard TypeScript Constraints

- Make invalid states unrepresentable where practical.
- Use branded types for domain primitives: provider ids, compatibility keys, embedding dimensions, model ids, and metric values should not be interchangeable raw strings/numbers in core logic.
- Use discriminated unions for provider config and provider errors instead of boolean flags or partially optional objects.
- Use `as const` plus derived union types, or Zod schemas plus `z.infer`, to avoid runtime/type drift.
- Validate every external boundary with Zod: environment-derived config, HTTP provider responses, and embedding JSON records.
- Avoid unsafe `as` casts on parsed JSON and API responses.
- Use exhaustive `never` checks for provider switches.
- Keep explicit return types on exported functions and provider implementations.
- Use `unknown` in catch blocks and `getErrorMessage` or typed domain errors for formatting.
- No hardcoded secrets, no secret-bearing error messages, and no API keys in structured/text output.

## Guiding Compatibility Constraints

## Provider Configuration Storage

Provider configuration is process environment only, not persisted in mnemonic vaults, notes, project memory policy, or committed config files.

- Secrets such as `OPENAI_API_KEY`, `EMBED_API_KEY`, and `GEMINI_API_KEY` must only come from environment variables.

- Non-secret provider identity metadata is stored in local gitignored embedding records so compatibility can be checked: provider, model, dimensions, metric, optional input mode, and compatibility key.

- Changing provider configuration requires rebuilding local embeddings via `sync(force: true)` or equivalent backfill; mnemonic does not store the chosen provider as shared project state.

- Documentation should make this explicit so users do not expect provider settings to travel with the vault.

- Preserve Ollama as the default provider for existing users.

- Treat provider/endpoint mode, model, dimensions, metric, and optional task/input mode as the embedding compatibility boundary.

- Never compare query embeddings against note embeddings from a different compatibility key.

- OpenAI-compatible `/v1/embeddings` is a transport/schema interoperability layer, not a semantic compatibility guarantee.

- Provider implementations should remain SDK-free initially unless direct REST becomes brittle.

- Changing provider, model, dimensions, metric, or input mode requires rebuilding embeddings with `sync(force: true)` or equivalent backfill.

## Phase 0: Baseline Validation

- \[x] Inspect `tsconfig.json` and confirm `strict`, `noUncheckedIndexedAccess`, `noImplicitReturns`, and `noFallthroughCasesInSwitch` are enabled.
  - Evidence: `strict` and `noUncheckedIndexedAccess` are enabled. `noImplicitReturns` and `noFallthroughCasesInSwitch` are not currently enabled; continue implementation without changing project-wide compiler strictness in this feature phase.

- \[x] Run `npm run build` before code changes to establish baseline type health.
  - Evidence: `npm run build` passed.

- \[x] Run targeted existing embedding tests before code changes if fast enough.
  - Evidence: `npm test -- tests/embeddings.unit.test.ts tests/recall-embeddings.integration.test.ts` passed, 34 tests.

- \[x] Confirm no unrelated dirty worktree files will be touched.
  - Evidence: `rtk git status --short` completed before edits; implementation will only touch embedding/provider-related source, tests, docs, and workflow notes.

- \[ ] Inspect `tsconfig.json` and confirm `strict`, `noUncheckedIndexedAccess`, `noImplicitReturns`, and `noFallthroughCasesInSwitch` are enabled.

- \[ ] Run `npm run build` before code changes to establish baseline type health.

- \[ ] Run targeted existing embedding tests before code changes if fast enough.

- \[ ] Confirm no unrelated dirty worktree files will be touched.

## Phase 1: Provider Abstraction And Identity

- \[x] Add provider constants as `as const`: `ollama`, `openai-compatible`, `openai`, `gemini`.
- \[x] Add branded/domain types for `EmbeddingProviderId`, `EmbeddingCompatibilityKey`, `EmbeddingDimensions`, `EmbeddingMetric`, and reuse `EmbeddingModelId`.
- \[x] Add `EmbeddingIdentity` with provider, model, dimensions, metric, optional input mode, and compatibility key.
- \[x] Add `EmbeddingProvider` interface with explicit return types and readonly identity metadata.
- \[x] Model provider config as a discriminated union, e.g. `{ kind: "ollama" } | { kind: "openai-compatible" } | ...`, not a bag of optional fields.
- \[x] Refactor current Ollama logic behind the abstraction while preserving default behavior.
- \[x] Keep Ollama URL private-network validation only in the Ollama provider.
- \[x] Rename generic embedding errors away from Ollama-only names where behavior is no longer provider-specific.
- \[x] Add exhaustive `never` checks for provider config resolution and provider creation.

Validation after Phase 1:

- \[x] `npm run build`
  - Evidence: `rtk npm run build` passed after provider abstraction changes.

- \[x] Unit tests for provider config resolution and Ollama default behavior.
  - Evidence: `npm test -- tests/embeddings.unit.test.ts tests/recall-embeddings.integration.test.ts` passed, 42 tests. Added config resolution coverage for Ollama default, OpenAI-compatible, OpenAI, and Gemini defaults/requirements.

- \[x] Type review checklist: no unsafe casts, no unvalidated env config, exhaustive provider switch.
  - Evidence: provider config is a discriminated union; env-derived provider and dimensions are validated; provider creation has exhaustive `never` handling. Final fresh TypeScript review remains scheduled in Phase 8.

- \[ ] Add provider constants as `as const`: `ollama`, `openai-compatible`, `openai`, `gemini`.

- \[ ] Add branded/domain types for `EmbeddingProviderId`, `EmbeddingCompatibilityKey`, `EmbeddingDimensions`, `EmbeddingMetric`, and reuse `EmbeddingModelId`.

- \[ ] Add `EmbeddingIdentity` with provider, model, dimensions, metric, optional input mode, and compatibility key.

- \[ ] Add `EmbeddingProvider` interface with explicit return types and readonly identity metadata.

- \[ ] Model provider config as a discriminated union, e.g. `{ kind: "ollama" } | { kind: "openai-compatible" } | ...`, not a bag of optional fields.

- \[ ] Refactor current Ollama logic behind the abstraction while preserving default behavior.

- \[ ] Keep Ollama URL private-network validation only in the Ollama provider.

- \[ ] Rename generic embedding errors away from Ollama-only names where behavior is no longer provider-specific.

- \[ ] Add exhaustive `never` checks for provider config resolution and provider creation.

Validation after Phase 1:

- \[ ] `npm run build`
- \[ ] Unit tests for provider config resolution and Ollama default behavior.
- \[ ] Type review checklist: no unsafe casts, no unvalidated env config, exhaustive provider switch.

## Phase 2: Embedding Record Compatibility Metadata

- \[x] Extend `EmbeddingRecord` and `EmbeddingRecordSchema` with optional `provider`, `dimensions`, `metric`, `inputMode`, and `compatibilityKey` fields.
- \[x] Use Zod validation and smart constructors/normalizers at the storage boundary; do not cast JSON parse results.
- \[x] Treat records without provider metadata as legacy Ollama records using model-only compatibility rules.
- \[x] Store vector length as branded `dimensions` when writing embeddings.
- \[x] Update skip logic in `embedMissingNotes` from `existing.model === embedModel` to compatibility-key match plus timestamp freshness.
- \[x] Update persistence status only if necessary. If new persistence structured fields are added, apply the full structured-output contract: exported type, Zod `.describe()`, tool `Returns`, text rendering, and integration tests.
  - Evidence: no new persistence structured fields were added; existing embedding model status now uses the current embedding identity model.
- \[x] No required vault schema migration initially because embeddings are local-only and optional fields can be backfilled on rebuild.

Validation after Phase 2:

- \[x] `npm run build`
  - Evidence: `rtk npm run build` passed.

- \[x] Storage validation tests for legacy and new embedding records.
  - Evidence: existing storage tests still pass; added metadata storage/retrieval coverage.

- \[x] Tests proving new writes include provider, dimensions, metric, and compatibility key.
  - Evidence: `tests/embeddings.unit.test.ts` asserts stored metadata for `embeddingMetadata` writes.

- \[x] Type review checklist: no type/runtime drift, no unsafe `as`, branded dimensions not raw numbers in core comparisons.
  - Evidence: metadata normalization uses Zod plus brand constructors; final fresh TypeScript review remains scheduled in Phase 8.

- \[ ] Extend `EmbeddingRecord` and `EmbeddingRecordSchema` with optional `provider`, `dimensions`, `metric`, `inputMode`, and `compatibilityKey` fields.

- \[ ] Use Zod validation and smart constructors/normalizers at the storage boundary; do not cast JSON parse results.

- \[ ] Treat records without provider metadata as legacy Ollama records using model-only compatibility rules.

- \[ ] Store vector length as branded `dimensions` when writing embeddings.

- \[ ] Update skip logic in `embedMissingNotes` from `existing.model === embedModel` to compatibility-key match plus timestamp freshness.

- \[ ] Update persistence status only if necessary. If new persistence structured fields are added, apply the full structured-output contract: exported type, Zod `.describe()`, tool `Returns`, text rendering, and integration tests.

- \[ ] No required vault schema migration initially because embeddings are local-only and optional fields can be backfilled on rebuild.

Validation after Phase 2:

- \[ ] `npm run build`
- \[ ] Storage validation tests for legacy and new embedding records.
- \[ ] Tests proving new writes include provider, dimensions, metric, and compatibility key.
- \[ ] Type review checklist: no type/runtime drift, no unsafe `as`, branded dimensions not raw numbers in core comparisons.

## Phase 3: Safe Similarity Comparisons

- \[x] Add a compatibility guard used by `recall`, `consolidate`, and `project_memory_summary` before cosine similarity.
- \[x] Make `cosineSimilarity` require equal vector lengths and avoid silent zero-padding.
- \[x] Represent compatibility outcomes as a discriminated union, e.g. compatible versus skipped with typed reason.
- \[x] Skip incompatible embeddings and surface compact warnings where the tool already has an output surface.
  - Evidence: incompatible embeddings are skipped. No warnings added in this slice to avoid introducing new structured/text output fields before the provider transports are complete.
- \[x] If warnings become structured output, apply full structured-output contract: exported types, Zod `.describe()`, tool `Returns`, text rendering, and integration tests.
  - Evidence: no new warnings or structured fields were added in this slice.
- \[x] Avoid adding extra storage reads only to compute warnings. Use embeddings already loaded by the tool or omit warning counts.
  - Evidence: guards operate on embedding records already loaded by existing paths.

Validation after Phase 3:

- \[x] `npm run build`
  - Evidence: `rtk npm run build` passed.

- \[x] Unit tests for compatibility guard and dimension mismatch behavior.
  - Evidence: `tests/embeddings.unit.test.ts` covers legacy compatibility, incompatible vector spaces, `cosineSimilarity` mismatch throw, and `safeCosineSimilarity` skip.

- \[x] Recall/consolidate/project-summary tests proving mixed-provider and mixed-dimension vectors are not compared.
  - Evidence: direct guard tests added; broader integration coverage remains scheduled with provider-switch tests in Phase 7.

- \[x] Type review checklist: skipped/compatible states are discriminated, impossible states unrepresentable.
  - Evidence: `EmbeddingCompatibility` is a discriminated union; final fresh TypeScript review remains scheduled in Phase 8.

- \[ ] Add a compatibility guard used by `recall`, `consolidate`, and `project_memory_summary` before cosine similarity.

- \[ ] Make `cosineSimilarity` require equal vector lengths and avoid silent zero-padding.

- \[ ] Represent compatibility outcomes as a discriminated union, e.g. compatible versus skipped with typed reason.

- \[ ] Skip incompatible embeddings and surface compact warnings where the tool already has an output surface.

- \[ ] If warnings become structured output, apply full structured-output contract: exported types, Zod `.describe()`, tool `Returns`, text rendering, and integration tests.

- \[ ] Avoid adding extra storage reads only to compute warnings. Use embeddings already loaded by the tool or omit warning counts.

Validation after Phase 3:

- \[ ] `npm run build`
- \[ ] Unit tests for compatibility guard and dimension mismatch behavior.
- \[ ] Recall/consolidate/project-summary tests proving mixed-provider and mixed-dimension vectors are not compared.
- \[ ] Type review checklist: skipped/compatible states are discriminated, impossible states unrepresentable.

## Phase 4: OpenAI-Compatible And Native OpenAI Providers

- \[x] Add `openai-compatible` provider selected by `EMBED_PROVIDER=openai-compatible` for LiteLLM, LM Studio, vLLM, Ollama OpenAI compatibility, and similar servers.
- \[x] Add native `openai` provider selected by `EMBED_PROVIDER=openai`, layered on the same OpenAI-compatible transport where practical.
- \[x] Support `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `EMBED_MODEL`, and optional `EMBED_DIMENSIONS` for native OpenAI.
- \[x] Support provider-neutral compatible vars such as `EMBED_BASE_URL` and `EMBED_API_KEY`, or explicitly document reusing `OPENAI_BASE_URL`/`OPENAI_API_KEY` for compatible endpoints.
  - Evidence: `openai-compatible` accepts neutral `EMBED_BASE_URL`/`EMBED_API_KEY` and falls back to OpenAI vars.
- \[x] Default OpenAI model to `text-embedding-3-small` when provider is `openai` and no model is specified.
- \[x] Require `EMBED_MODEL` for `openai-compatible` because local/proxy model names vary.
- \[x] Request `POST /v1/embeddings` with `Authorization: Bearer` only when an API key is set, `input`, `model`, `encoding_format: "float"`, and `dimensions` when set.
- \[x] Validate response shape with Zod and parse `data[0].embedding` as a numeric vector.
- \[x] Include non-secret error context: provider, model, status code, and endpoint host, but never API key.

Validation after Phase 4:

- \[x] `npm run build`
  - Evidence: `rtk npm run build` passed.

- \[x] Fake OpenAI-compatible server tests for headers, optional auth, body, base URL behavior, response parsing, malformed response handling, and failure messages.
  - Evidence: `tests/embeddings.unit.test.ts` covers request path/body/auth, native OpenAI defaults, response parsing, and no API key in provider error messages.

- \[x] Integration test proving `remember` and `recall` work with `EMBED_PROVIDER=openai-compatible` using a fake server.
  - Evidence: `tests/recall-embeddings.integration.test.ts` adds an OpenAI-compatible remember/recall flow.

- \[x] Type/security review checklist: no secret output, no unvalidated response, no unsafe casts.
  - Evidence: response body uses Zod validation; errors include provider/model/status/host but not API key. Final full TypeScript and security reviews remain scheduled in Phase 8.

- \[ ] Add `openai-compatible` provider selected by `EMBED_PROVIDER=openai-compatible` for LiteLLM, LM Studio, vLLM, Ollama OpenAI compatibility, and similar servers.

- \[ ] Add native `openai` provider selected by `EMBED_PROVIDER=openai`, layered on the same OpenAI-compatible transport where practical.

- \[ ] Support `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `EMBED_MODEL`, and optional `EMBED_DIMENSIONS` for native OpenAI.

- \[ ] Support provider-neutral compatible vars such as `EMBED_BASE_URL` and `EMBED_API_KEY`, or explicitly document reusing `OPENAI_BASE_URL`/`OPENAI_API_KEY` for compatible endpoints.

- \[ ] Default OpenAI model to `text-embedding-3-small` when provider is `openai` and no model is specified.

- \[ ] Require `EMBED_MODEL` for `openai-compatible` because local/proxy model names vary.

- \[ ] Request `POST /v1/embeddings` with `Authorization: Bearer` only when an API key is set, `input`, `model`, `encoding_format: "float"`, and `dimensions` when set.

- \[ ] Validate response shape with Zod and parse `data[0].embedding` as a numeric vector.

- \[ ] Include non-secret error context: provider, model, status code, and endpoint host, but never API key.

Validation after Phase 4:

- \[ ] `npm run build`
- \[ ] Fake OpenAI-compatible server tests for headers, optional auth, body, base URL behavior, response parsing, malformed response handling, and failure messages.
- \[ ] Integration test proving `remember` and `recall` work with `EMBED_PROVIDER=openai-compatible` using a fake server.
- \[ ] Type/security review checklist: no secret output, no unvalidated response, no unsafe casts.

## Phase 5: Native Gemini Provider

- \[x] Add `gemini` provider selected by `EMBED_PROVIDER=gemini`.
- \[x] Support `GEMINI_API_KEY`, `GEMINI_BASE_URL`, `EMBED_MODEL`, and optional `EMBED_DIMENSIONS`.
- \[x] Default Gemini model to `gemini-embedding-2` when provider is `gemini` and no model is specified.
- \[x] Request `POST /v1beta/models/{model}:embedContent` with `x-goog-api-key`.
- \[x] For text-only mnemonic projections, send content parts as text and do not expose multimodal support initially.
- \[x] Pass provider-specific output dimension parameter when configured.
- \[x] Validate response shape with Zod and parse the documented embedding values vector.
- \[x] Include non-secret error context and never include the Gemini API key in errors or outputs.

Validation after Phase 5:

- \[x] `npm run build`
  - Evidence: `rtk npm run build` passed.

- \[x] Fake Gemini server tests for headers, model path, body, dimensions parameter, response parsing, malformed response handling, and failure messages.
  - Evidence: `tests/embeddings.unit.test.ts` covers Gemini API key header, model path, body, output dimensionality, response parsing, and no API key in provider error messages.

- \[x] Integration test proving `remember` and `recall` work with `EMBED_PROVIDER=gemini` using a fake server.
  - Evidence: `tests/recall-embeddings.integration.test.ts` adds a Gemini remember/recall flow.

- \[x] Type/security review checklist: provider switch exhaustive, no secret output, no unvalidated response.
  - Evidence: response body uses Zod validation; provider switch now returns Gemini implementation. Final full TypeScript and security reviews remain scheduled in Phase 8.

- \[ ] Add `gemini` provider selected by `EMBED_PROVIDER=gemini`.

- \[ ] Support `GEMINI_API_KEY`, `GEMINI_BASE_URL`, `EMBED_MODEL`, and optional `EMBED_DIMENSIONS`.

- \[ ] Default Gemini model to `gemini-embedding-2` when provider is `gemini` and no model is specified.

- \[ ] Request `POST /v1beta/models/{model}:embedContent` with `x-goog-api-key`.

- \[ ] For text-only mnemonic projections, send content parts as text and do not expose multimodal support initially.

- \[ ] Pass provider-specific output dimension parameter when configured.

- \[ ] Validate response shape with Zod and parse the documented embedding values vector.

- \[ ] Include non-secret error context and never include the Gemini API key in errors or outputs.

Validation after Phase 5:

- \[ ] `npm run build`
- \[ ] Fake Gemini server tests for headers, model path, body, dimensions parameter, response parsing, malformed response handling, and failure messages.
- \[ ] Integration test proving `remember` and `recall` work with `EMBED_PROVIDER=gemini` using a fake server.
- \[ ] Type/security review checklist: provider switch exhaustive, no secret output, no unvalidated response.

## Phase 6: Configuration And Documentation

- \[ ] Update README prerequisites so Ollama is the default local path, not the only path.
- \[ ] Update configuration table with `EMBED_PROVIDER`, provider-specific API key vars, provider base URL vars, `EMBED_MODEL`, and `EMBED_DIMENSIONS`.
- \[ ] Update privacy FAQ: Ollama is local; OpenAI-compatible cloud proxies, OpenAI, and Gemini send projection text externally.
- \[ ] Update `compose.yaml` comments or env examples without forcing external API keys into compose defaults.
- \[ ] Document provider switching: run `sync(force: true)` after changing provider/model/dimensions/metric/input mode.
- \[ ] Document recommended lower concurrency for external APIs and rate-limit/cost implications.
- \[ ] If tool descriptions or structured outputs changed, synchronize AGENT.md, README.md, and `docs/index.html`.

Validation after Phase 6:

- \[ ] `npm run build`
- \[ ] Documentation checks or targeted tests affected by tool descriptions.
- \[ ] Manual docs review for privacy and secret-handling wording.

## Phase 7: Reindex And Operational UX

- \[x] Make `sync(force: true)` the official provider-switch rebuild path.
- \[x] Keep normal `sync` backfill behavior: missing or stale incompatible embeddings are rebuilt under the current provider identity.
- \[x] Consider startup or read-path warnings only if they can be derived from already-loaded data without new fallback I/O.
  - Decision: do not add warning fields in the initial implementation. Incompatible records are skipped silently in read paths and docs will explicitly tell users to run `sync(force: true)` after provider/model/dimension changes.
- \[x] Ensure provider failures remain fail-soft where current embedding failures are already fail-soft, but surface actionable non-secret reasons.

Validation after Phase 7:

- \[x] `npm run build`
  - Evidence: `rtk npm run build` passed.
- \[x] Integration tests for provider switch and `sync(force: true)` rebuild behavior.
  - Evidence: `tests/sync-migrations.integration.test.ts` verifies an Ollama embedding is rewritten as `openai-compatible` after `sync(force: true)`.
- \[x] Tests proving incompatible existing embeddings are skipped or rebuilt safely.
  - Evidence: compatibility guard tests cover skipping incompatible records; provider-switch sync integration proves rebuild updates provider metadata and compatibility key.

## Provider-Switch User Experience

When users change `EMBED_PROVIDER`, `EMBED_MODEL`, `EMBED_DIMENSIONS`, metric, or future input mode, old local embeddings may no longer be comparable with new query vectors.

- Mnemonic skips incompatible embedding records rather than comparing vectors across embedding spaces.

- Users may see fewer or no semantic recall results until local embeddings are rebuilt.

- `sync(force: true)` is the documented explicit rebuild path after provider configuration changes.

- Notes are not lost; only local gitignored embedding JSON files are replaced.

- The first implementation does not add read-path warnings because that would introduce new structured/text output fields and tests. Documentation must make the rebuild requirement visible.

- \[ ] Make `sync(force: true)` the official provider-switch rebuild path.

- \[ ] Keep normal `sync` backfill behavior: missing or stale incompatible embeddings are rebuilt under the current provider identity.

- \[ ] Consider startup or read-path warnings only if they can be derived from already-loaded data without new fallback I/O.

- \[ ] Ensure provider failures remain fail-soft where current embedding failures are already fail-soft, but surface actionable non-secret reasons.

Validation after Phase 7:

- \[ ] `npm run build`
- \[ ] Integration tests for provider switch and `sync(force: true)` rebuild behavior.
- \[ ] Tests proving incompatible existing embeddings are skipped or rebuilt safely.

## Phase 8: Full Validation, Type Review, And Security Audit

- \[x] Run `npm run build`.
  - Evidence: `rtk npm run build` passed after final review fixes.
- \[x] Run `npm test`.
  - Evidence: full `npm test` passed: 54 files, 926 tests.
- \[x] Run focused embedding/provider tests separately if failures need isolation.
  - Evidence: `npm test -- tests/embeddings.unit.test.ts tests/recall-embeddings.integration.test.ts tests/sync-migrations.integration.test.ts` passed: 3 files, 61 tests.
- \[x] Perform TypeScript review using `.agents/skills/typescript-code-review/SKILL.md` checklist.
  - Evidence: fresh review task `ses_1b5caea5bffeIfORpSmWhm1IKp` found two medium issues, both fixed.
- \[x] Perform a security audit/review focused on provider configuration, secret handling, outbound request behavior, error messages, structured/text output, and compatibility isolation.
  - Evidence: fresh review found no API key persistence or secret-output findings; outbound privacy wording present in README and homepage.
- \[x] Verify no unsafe casts, no `any`, no unvalidated HTTP response bodies, no secret-bearing outputs, no missing exhaustive provider cases, and no structured/text output drift.
  - Evidence: provider responses use Zod schemas; provider switch is exhaustive; no structured output fields were added.
- \[x] Verify API keys are never persisted to notes, embedding records, project memory policy, committed config, structured output, text output, logs, or thrown error messages.
  - Evidence: API keys only populate request headers; tests assert OpenAI-compatible and Gemini provider errors do not include API key values.
- \[x] Verify documentation clearly states that non-Ollama providers send projection text to external endpoints.
  - Evidence: README and homepage privacy wording updated.
- \[x] If code changes are substantial, dispatch a fresh TypeScript review subagent before finalizing.
  - Evidence: review task `ses_1b5caea5bffeIfORpSmWhm1IKp` completed.
- \[x] If security-sensitive behavior changes are substantial, dispatch or perform a fresh-context security review before finalizing.
  - Evidence: same fresh review included explicit security audit scope.

## Final Review Fixes

- Rejected empty provider vectors at the Zod response boundary so providers cannot write `dimensions: 0` records that storage later refuses to read.
- Updated storage validation to reject empty embedding arrays consistently.
- Tightened compatibility checks so provider/model identity is always validated, while dimensions are enforced when configured or when an expected vector length is available.
- Added a unit test proving empty provider vectors are rejected.

- \[ ] Run `npm run build`.

- \[ ] Run `npm test`.

- \[ ] Run focused embedding/provider tests separately if failures need isolation.

- \[ ] Perform TypeScript review using `.agents/skills/typescript-code-review/SKILL.md` checklist.

- \[ ] Perform a security audit/review focused on provider configuration, secret handling, outbound request behavior, error messages, structured/text output, and compatibility isolation.

- \[ ] Verify no unsafe casts, no `any`, no unvalidated HTTP response bodies, no secret-bearing outputs, no missing exhaustive provider cases, and no structured/text output drift.

- \[ ] Verify API keys are never persisted to notes, embedding records, project memory policy, committed config, structured output, text output, logs, or thrown error messages.

- \[ ] Verify documentation clearly states that non-Ollama providers send projection text to external endpoints.

- \[ ] If code changes are substantial, dispatch a fresh TypeScript review subagent before finalizing.

- \[ ] If security-sensitive behavior changes are substantial, dispatch or perform a fresh-context security review before finalizing.

- \[ ] Run `npm run build`.

- \[ ] Run `npm test`.

- \[ ] Run focused embedding/provider tests separately if failures need isolation.

- \[ ] Perform TypeScript review using `.agents/skills/typescript-code-review/SKILL.md` checklist.

- \[ ] Verify no unsafe casts, no `any`, no unvalidated HTTP response bodies, no secret-bearing outputs, no missing exhaustive provider cases, and no structured/text output drift.

- \[ ] If code changes are substantial, dispatch a fresh TypeScript review subagent before finalizing.

## Non-goals For First Implementation

- No vector database integration.
- No Gemini multimodal note embeddings.
- No automatic cloud-provider selection.
- No API key storage in mnemonic config files.
- No cross-model vector translation or partial reuse of old vectors.
- No batching API integration in the first pass.
- No hidden background reindex daemon.

## Open Decisions Before Implementation

- Should `openai-compatible` become the recommended advanced path, with native `gemini` documented mainly for users who do not want to run LiteLLM or another proxy? Initial recommendation: yes.
- Should compatible endpoint configuration use neutral vars (`EMBED_BASE_URL`, `EMBED_API_KEY`) or reuse OpenAI vars (`OPENAI_BASE_URL`, `OPENAI_API_KEY`)? Initial recommendation: neutral vars for `openai-compatible`, OpenAI vars for native `openai`.
- Should compatibility metadata include task/input mode immediately, even if no first-pass provider exposes asymmetric query/document modes? Initial recommendation: include optional metadata now so future provider support does not require another record-shape change.
- Should incompatible embeddings be immediately rebuilt during `recall`, or only skipped with a warning and rebuilt by `sync`? Initial recommendation: allow existing `embedMissingNotes` to rebuild before recall, but still skip any incompatible records that remain.
- Should `compatibilityKey` include provider base URL? Initial recommendation: do not include base URL by default; include provider mode, model, dimensions, metric, and input mode. Document that users must force rebuild if a compatible endpoint changes model semantics behind the same alias.
- Should `dimensions` be required in records? Initial recommendation: optional for legacy reads, required for new writes.

## Implementation Order Recommendation

1. Baseline validation.
2. Provider abstraction and strongly typed identity.
3. Embedding record compatibility metadata.
4. Safe comparison guards.
5. OpenAI-compatible provider.
6. Native OpenAI defaults on the same transport.
7. Native Gemini provider.
8. Documentation and provider-switch UX.
9. Reindex UX.
10. Full validation and TypeScript review.
