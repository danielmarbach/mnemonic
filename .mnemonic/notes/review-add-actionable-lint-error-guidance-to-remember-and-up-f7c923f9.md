---
title: 'Review: Add actionable lint error guidance to remember and update'
tags:
  - workflow
  - review
  - linting
  - error-handling
lifecycle: temporary
createdAt: '2026-05-01T12:56:17.051Z'
updatedAt: '2026-05-01T12:56:21.212Z'
role: review
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: plan-add-actionable-lint-error-guidance-to-remember-and-upda-86542d51
    type: derives-from
memoryVersion: 1
---
## Implementation Summary

Implemented 5 changes to add actionable lint error handling for `remember` and `update(content)`:

1. **LintErrorResult** (`src/structured-content.ts`): Added interface and Zod schema for structured error responses with `action: "lint_error"`, `tool: "remember" | "update"`, `issues: string[]`.

2. **Remember handler try/catch** (`src/index.ts:1962-1975`): Catches `MarkdownLintError` from `cleanMarkdown` and returns dual response (text + structuredContent) with "note was NOT stored" guidance and `isError: true`.

3. **Update(content) handler try/catch** (`src/index.ts:3076-3092`): Same pattern, with "do NOT fall back to semanticPatch" guidance mirroring the existing semanticPatch lint error message.

4. **Content parameter descriptions** (`src/index.ts:1902-1906`, `src/index.ts:2993`): Added proactive lint guidance (auto-fixable vs. unfixable, MD040 common gotcha, fix-and-retry instruction).

5. **Linting decision note** updated with the new error handling approach.

## Verification

- TypeCheck: clean (0 errors)
- Unit tests: 827 pass, 0 fail
- 1 pre-existing MCP integration test failure (missing export `applyCanonicalExplanationPromotion`) — not related to these changes

## Dogfooding observation

This fix was triggered by an exact self-dogfooding incident: the first `remember` call in this conversation failed with MD040 (fenced code blocks without language tags), and the raw error provided no guidance to fix and retry. After implementing the fix, the same pattern would now produce a clear actionable message.
