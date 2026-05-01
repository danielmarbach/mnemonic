---
title: 'Plan: Add actionable lint error guidance to remember and update'
tags:
  - workflow
  - plan
  - linting
  - error-handling
lifecycle: temporary
createdAt: '2026-05-01T12:14:25.947Z'
updatedAt: '2026-05-01T12:14:40.977Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: markdown-linting-for-memory-content-259a1c85
    type: related-to
  - id: semantic-patch-builder-design-implementation-906872f1
    type: related-to
  - id: research-remember-update-lint-error-lacking-llm-retry-guidan-505523cc
    type: derives-from
memoryVersion: 1
---
## Context

request root: research-remember-update-lint-error-lacking-llm-retry-guidan-505523cc

Problem: LLMs sometimes ignore markdown lint errors from `remember`/`update(content)` and carry on as if the note was stored. The root cause is missing try/catch with actionable retry guidance — the `semanticPatch` path already has this.

## Plan

### Fix 1: Add try/catch for MarkdownLintError in `remember` handler

**File:** `src/index.ts` (around line 1963)
**What:** Wrap `const cleanedContent = await cleanMarkdown(content);` in a try/catch that catches `MarkdownLintError` and returns a structured MCP error response with:

```text
Markdown lint issues prevented this note from being stored. Fix the specific lint errors listed below in your content and retry the remember call — the note was NOT stored.

{err.message}
```

**Why:** `cleanMarkdown` throws `MarkdownLintError` for unfixable lint. Without a catch, this propagates as a generic MCP error with no actionable guidance. LLMs see the error but don't know they should fix and retry, so they sometimes carry on.

### Fix 2: Add try/catch for MarkdownLintError in `update(content)` handler

**File:** `src/index.ts` (around line 3061)
**What:** Wrap `const cleanedContent = content === undefined ? undefined : await cleanMarkdown(content);` in a try/catch that catches `MarkdownLintError` and returns a structured MCP error response with:

```text
Markdown lint issues prevented the update. Fix the specific lint errors listed below in your content and retry — do NOT fall back to semanticPatch for this.

{err.message}
```

**Why:** Same problem as `remember`. The `update` handler already catches lint errors from `semanticPatch` but not from the `content` path.

### Fix 3: Add markdown lint guidance to `content` parameter description

**File:** `src/index.ts`
**What:** Add a brief note to the `content` parameter description in both `remember` and `update` tools mentioning:

- Content must pass markdown lint (auto-fixable issues are fixed automatically)
- Common unfixable issues: fenced code blocks need language tags, broken links
- If lint fails, fix the specific issues and retry

**Why:** Following the existing design principle from `semantic-patch-builder-design-implementation` — "Guidance at the Schema Level, Not Just Error Messages." Schema-level guidance fires before the handler runs, preventing wasted retries. LLMs commonly produce fenced code blocks without language tags (MD040).

### Fix 4: Update the linting decision note

**What:** Update `markdown-linting-for-memory-content-259a1c85` to document the new error handling approach: `remember` and `update(content)` now catch `MarkdownLintError` and return structured errors with retry guidance, mirroring the `semanticPatch` pattern.

## Checkboxes

- [ ] Add try/catch for MarkdownLintError in remember handler
- [ ] Add try/catch for MarkdownLintError in update(content) handler
- [ ] Add lint guidance to content parameter descriptions
- [ ] Update linting decision note
