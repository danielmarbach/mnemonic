---
title: 'Review: semanticPatch lint error handling improvements'
tags:
  - workflow
  - review
lifecycle: temporary
createdAt: '2026-04-24T19:05:03.894Z'
updatedAt: '2026-04-24T19:05:03.894Z'
role: review
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
# Review: semanticPatch lint error handling improvements

## Outcome: Continue — all changes implemented and verified

## What was done

### Issue 1: Auto-fix lint in patch values (formerly a hard error)

- Added `attemptCleanMarkdown` in `src/markdown.ts` — returns `{ cleaned, warnings }` instead of throwing
- Refactored `cleanMarkdown` to delegate to `attemptCleanMarkdown` and throw on warnings
- `applySemanticPatches` now uses `attemptCleanMarkdown`, lint warnings become advisory
- Patch succeeds with warnings surfaced, not rejected

### Issue 2: Better error messages

- `MarkdownLintError` in patch path gives explicit guidance: "Fix the lint issues in your patch values and retry — do NOT fall back to full content rewrite"
- `semanticPatch` parameter description updated with same guidance at the schema level

### Issue 3: Separate structural vs content errors

- Structural errors (selector not found, unknown operation) → "Semantic patch failed:" + diagnostic hard fail
- Content lint issues → success with advisory warnings, not rejection
- Caught at different points: structural in `applySemanticPatches` (throws Error), lint in `attemptCleanMarkdown` (returns warnings)

### Structured content

- `UpdateResult` interface and schema gained `lintWarnings: string[]`
- Text response includes warnings as "markdown lint warnings (auto-fixed):" section

## Verification

- 682 tests pass (all 46 test files, no regressions)
- Unit tests updated for new return type: `applySemanticPatches` returns `{ content, lintWarnings }`
- Integration tests pass through real MCP server handler
- Design note updated with lenient lint decision and changed error behavior

## Files changed

- `src/markdown.ts` — added `attemptCleanMarkdown`, refactored `cleanMarkdown`
- `src/semantic-patch.ts` — use `attemptCleanMarkdown`, return `{ content, lintWarnings }`
- `src/index.ts` — distinguish error types, surface warnings, tool description guidance
- `src/structured-content.ts` — added `lintWarnings` to interface and schema
- `tests/semantic-patch.unit.test.ts` — updated for new return type
- `tests/markdown.unit.test.ts` — added attemptCleanMarkdown tests
