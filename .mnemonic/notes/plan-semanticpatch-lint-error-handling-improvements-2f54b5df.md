---
title: 'Plan: semanticPatch lint error handling improvements'
tags:
  - workflow
  - plan
lifecycle: temporary
createdAt: '2026-04-24T18:49:06.872Z'
updatedAt: '2026-04-24T18:49:06.872Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
# Plan: semanticPatch lint error handling improvements

## Background

Three related issues with the semanticPatch update flow:

### Issue 1: Auto-fix lint in patch values before writing

`applySemanticPatches` calls `cleanMarkdown(serialized)` at the end. `cleanMarkdown` has a 3-attempt auto-fix loop for fixable issues, but if ANY issues remain after auto-fix (even auto-fixable ones that somehow survive 3 rounds), it throws `MarkdownLintError`. There's no recovery at the handler level.

Root cause in `src/markdown.ts:35-59`: the auto-fix loop only runs 3 attempts. For common issues like MD035 (horizontal rule style `---` vs `***`), markdownlint's `applyFixes` may not fix them in the first pass. The loop hits its limit, and the remaining issues cause a throw.

### Issue 2: Better error message

The error message is "Semantic patch failed: Markdown lint failed:\n- line N: MD035/MD035 Horizontal rule style (expected ---)" with no guidance to the LLM about how to fix it (change the horizontal rule syntax in the patch value and retry, don't fall back to full content rewrite).

### Issue 3: No distinction between structural and content errors

Both "selector not found" (structural) and "lint failure" (content) get caught by the SAME try/catch in the update handler at `src/index.ts:2854-2860`. The LLM can't tell whether it needs to fix its selector or its content.

## Implementation

### Step 1: Add `attemptCleanMarkdown` in `src/markdown.ts`

A lenient variant that returns `{ cleaned: string; warnings: string[] }` instead of throwing:

```typescript
export async function attemptCleanMarkdown(markdown: string): Promise<{ cleaned: string; warnings: string[] }> {
  // Same normalize + auto-fix loop as cleanMarkdown
  // But instead of throwing on remaining issues, returns them as warnings
  // Also: applyFixes one more round for each remaining unfixable issue after main loop
  // to catch edge cases where fixable issues survive 3 rounds
}
```

Refactor `cleanMarkdown` to use `attemptCleanMarkdown` internally:

```typescript
export async function cleanMarkdown(markdown: string): Promise<string> {
  const { cleaned, warnings } = await attemptCleanMarkdown(markdown);
  if (warnings.length > 0) {
    throw new MarkdownLintError(warnings);
  }
  return cleaned;
}
```

### Step 2: Update `applySemanticPatches` in `src/semantic-patch.ts`

Change the return type to `Promise<{ content: string; lintWarnings: string[] }>` and use `attemptCleanMarkdown` instead of `cleanMarkdown`. Structural errors (selector not found, invalid operation) still throw as before.

### Step 3: Update the update handler in `src/index.ts`

- Catch `MarkdownLintError` specifically vs structural errors
- Return lint warnings in the success response as advisory (not an error)
- Structural errors still hard-fail with "Semantic patch failed: ..."
- Include lint warnings in the response text so the LLM sees them

## Risk

- `applySemanticPatches` return type changes — callers must be updated (only in `src/index.ts`)
- `cleanMarkdown` behavior is preserved exactly (still throws on unfixable issues)
- The `attemptCleanMarkdown` naming makes the leniency explicit

## Validation

- All existing tests must pass without modification
- New tests for `attemptCleanMarkdown` in `tests/markdown.unit.test.ts`
- New test in `tests/semantic-patch.unit.test.ts` that a patch producing fixable lint (like `---`) succeeds and returns warnings
- Typecheck clean
