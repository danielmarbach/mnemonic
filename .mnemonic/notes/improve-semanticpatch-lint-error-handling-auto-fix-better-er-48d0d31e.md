---
title: >-
  Improve semanticPatch lint error handling: auto-fix, better errors, no
  fallback ease
tags:
  - workflow
  - request
lifecycle: temporary
createdAt: '2026-04-24T18:48:51.710Z'
updatedAt: '2026-04-24T18:48:51.710Z'
role: context
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
# Request: Improve semanticPatch lint error handling

## Problem

Three issues with the semanticPatch flow when markdown lint fails:

1. **Auto-fix lint in patch values before writing** — when patch values contain auto-fixable lint issues (like `---` instead of `***` for horizontal rules), `cleanMarkdown` throws instead of auto-fixing and proceeding. The fix is trivial but the rejection forces the LLM to retry.

2. **Better error message** — the error just says "Semantic patch failed: Markdown lint failed:" with line numbers. It doesn't guide the LLM toward the correct recovery path (fix lint in patch values and retry, don't fall back to full content rewrite).

3. **Separate structural validation from content validation** — selector-not-found (structural) and lint-failure (content) are both caught by the same try/catch with the same "Semantic patch failed:" prefix. The LLM can't distinguish "your selector is wrong" from "your content has lint issues."

## Approach

- Export a lenient `attemptCleanMarkdown` variant that returns `{ cleaned: string, warnings?: string[] }` instead of throwing on unfixable lint.
- Refactor `cleanMarkdown` to use `attemptCleanMarkdown` internally and throw on warnings.
- Change `applySemanticPatches` to use `attemptCleanMarkdown` and return warnings alongside the cleaned content.
- Update the update handler to surface lint warnings in the success response (not an error), so the LLM sees them as advisory.
- Distinguish error types: structural failures (selector not found, invalid operation) still hard-fail; lint warnings are advisory.

## Files

- `src/markdown.ts` — add `attemptCleanMarkdown`, refactor `cleanMarkdown`
- `src/semantic-patch.ts` — use lenient cleaning, return warnings
- `src/index.ts` — distinguish error types, surface warnings in response
- `tests/semantic-patch.unit.test.ts` — add tests for lint warning behavior
- `tests/markdown.unit.test.ts` — add tests for attemptCleanMarkdown
