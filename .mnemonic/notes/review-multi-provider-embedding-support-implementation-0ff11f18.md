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
updatedAt: '2026-05-21T11:10:39.974Z'
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

Proceed with the implementation. Future improvement, if needed, is a compact read-path warning for skipped incompatible embeddings, but that should be planned separately because it adds structured/text output fields and tests.
