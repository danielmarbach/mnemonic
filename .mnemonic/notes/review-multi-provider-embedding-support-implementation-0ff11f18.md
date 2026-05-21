---
title: 'Review: Multi-provider embedding support implementation'
tags:
  - workflow
  - review
  - embeddings
  - providers
  - security
lifecycle: temporary
createdAt: '2026-05-21T11:10:33.111Z'
updatedAt: '2026-05-21T11:24:48.631Z'
role: review
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: apply-multi-provider-embedding-support-implementation-f55f935a
    type: derives-from
memoryVersion: 1
---
# Review: Multi-provider Embedding Support Implementation

Outcome: continue. The implementation satisfies the multi-provider embedding plan after final review fixes.

## Review Scope

Compared implementation against:

- Plan: `plan-multi-provider-embedding-support-for-mnemonic-fa944256`
- Research: `research-multi-provider-embedding-support-for-mnemonic-4c2dc9b6`
- Apply note: `apply-multi-provider-embedding-support-implementation-f55f935a`

## Findings

- Initial fresh review found two medium issues: empty vectors could be written and then rejected on read, and compatibility checks were too weak for some non-query paths.
- Both findings were fixed before finalizing: provider schemas now require non-empty vectors, storage validation matches, and compatibility checks always validate provider/model identity.
- No API key persistence or secret-output findings remained after review.
- No structured-output fields were added, so no schema/tool-description synchronization was required.
- Documentation now distinguishes environment-only provider configuration from non-secret local embedding metadata.
- README and homepage avoid command-like `sync` wording for provider rebuilds and say to call the `sync` MCP tool with `force: true`.

## Verification Evidence

- Command: `rtk npm run build`

- Result: pass

- Details: TypeScript build and `tsc --noEmit` passed.

- Command: `npm test -- tests/embeddings.unit.test.ts tests/recall-embeddings.integration.test.ts tests/sync-migrations.integration.test.ts`

- Result: pass

- Details: 3 files, 61 tests passed.

- Command: `npm test`

- Result: pass

- Details: 54 files, 926 tests passed.

- Command: fresh review task `ses_1b5caea5bffeIfORpSmWhm1IKp`

- Result: pass after fixes

- Details: TypeScript/security review found two medium issues; both were fixed and revalidated.

## Residual Risks

- Provider default dimensions are discovered from responses rather than hardcoded for every model. If an endpoint changes semantics behind the same provider/model alias without changing configured dimensions, users must call the `sync` MCP tool with `force: true` as documented.
- OpenAI-compatible endpoints vary by implementation; tests cover the common `/v1/embeddings` request/response shape, optional auth, dimensions, and malformed response handling.
- No live cloud-provider tests are part of the default suite by design; fake-provider tests avoid secrets, network dependency, cost, and provider availability.

## Recommendation

## Code Architecture Review

### Strengths

- **Branded types** (`src/brands.ts`) for `EmbeddingProviderId`, `EmbeddingCompatibilityKey`, `EmbeddingDimensions`, `EmbeddingMetric` — makes invalid states unrepresentable at the type level.
- **Discriminated union** `EmbeddingProviderConfig` with `kind` field — no bag-of-optionals antipattern (`src/embeddings.ts:48-52`).
- **Exhaustive `never` checks** in both `resolveEmbeddingProviderConfig` (line 192) and `createEmbeddingProvider` (line 333).
- **Zod validation** at every external boundary: provider responses (`OllamaEmbedResponseSchema`, `OpenAIEmbeddingResponseSchema`, `GeminiEmbeddingResponseSchema`), embedding records (`EmbeddingRecordSchema`), and config resolution.
- **Compatibility guard** (`checkEmbeddingCompatibility`) returns a discriminated union (`compatible` | `skipped`) with typed reasons, integrated into recall, consolidate, and project-memory-summary.
- **Security**: API keys only read from environment, never persisted. Error messages include provider/model/status/host but never key values. Tests explicitly assert no API key in error messages.
- **SDK-free**: All providers use raw `fetch` — no external dependencies added.
- **Backward compatible**: Ollama remains default, legacy records without provider metadata are handled gracefully.

### Observations

1. **`cosineSimilarity` throws on mismatch** (line 369) — the old silent padding is gone. All callers already route through `safeCosineSimilarity` or `checkEmbeddingCompatibility` first, so the throw is a last-resort invariant check. Design is intentional and correct.

2. **Legacy record compatibility** (`checkEmbeddingCompatibility` lines 393-398) — records without `provider` field are assumed to be legacy Ollama. Acceptable given the migration path (force rebuild).

3. **`inputMode` future-proofing** — included in `buildCompatibilityKey` (line 131) but never set by any current provider (always `"default"`). Explicit plan decision to include it now for forward compatibility.

4. **Dimensions discovered from responses** — provider `dimensions` are not pre-declared but extracted from response vector length. Residual risk acknowledged: if an endpoint changes behavior under the same model alias, users must `sync(force: true)`.

5. **Phase 6 docs verified** — README has `EMBED_PROVIDER` config table, homepage has provider configuration section, CHANGELOG has entry, AGENT.md synchronized. All unchecked plan items confirmed complete by code inspection.

### Test Coverage Assessment

- **61 tests** across 3 focused test files, all passing.
- Unit tests cover: config resolution, identity/compatibility keys, Zod response parsing for all 3 provider shapes, `cosineSimilarity` mismatch, compatibility guards, storage validation with metadata.
- Integration tests cover: remember/recall flows for Ollama, OpenAI-compatible, and Gemini; provider-switch sync rebuild (Ollama → openai-compatible); staleness detection; backfill.
- Tests use hermetic fake HTTP servers — no real provider dependencies.

### Final Verdict

Well-executed feature. RPIR workflow produced a thorough plan that was faithfully implemented. Type discipline is strong, security properties are verified, test coverage is meaningful. Ready to merge.

Proceed with the implementation. Future improvement, if needed, is a compact read-path warning for skipped incompatible embeddings, but that should be planned separately because it adds structured/text output fields and tests.
