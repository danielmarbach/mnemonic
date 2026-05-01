---
title: 'Plan: Add actionable lint error guidance to remember and update'
tags:
  - workflow
  - plan
  - linting
  - error-handling
lifecycle: temporary
createdAt: '2026-05-01T12:14:25.947Z'
updatedAt: '2026-05-01T12:56:21.212Z'
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
  - id: review-add-actionable-lint-error-guidance-to-remember-and-up-f7c923f9
    type: derives-from
memoryVersion: 1
---
## Context

request root: research-remember-update-lint-error-lacking-llm-retry-guidan-505523cc

Problem: LLMs sometimes ignore markdown lint errors from `remember`/`update(content)` and carry on as if the note was stored. The root cause is missing try/catch with actionable retry guidance — the `semanticPatch` path already has this.

**Self-dogfooding evidence:** In this very conversation, the first `remember` call for the research note hit MD040 (fenced code blocks without language tags). The raw error gave no guidance — I had to manually know to fix the lint issues and retry. This is exactly the problem we're fixing.

**structuredContent pattern:** The project consistently returns both `content` (text for LLM) and `structuredContent` (machine-readable data) from tool handlers. Error responses must follow this same dual pattern. `UpdateResult` already has `lintWarnings?: string[]`. For lint error rejections, we need a `LintErrorResult` with `action: "lint_error"`, `tool`, and `issues`.

## Plan

### Fix 1: Add LintErrorResult to structured-content.ts

**File:** `src/structured-content.ts`
**What:** Add a `LintErrorResult` interface and `LintErrorResultSchema`:

- `action: "lint_error"`
- `tool: "remember" | "update"`
- `issues: string[]`

**Why:** Error responses need structured content too, not just text. This follows the project's dual-response pattern.

### Fix 2: Add try/catch for MarkdownLintError in `remember` handler

**File:** `src/index.ts` (around line 1963)
**What:** Wrap `const cleanedContent = await cleanMarkdown(content);` in a try/catch that catches `MarkdownLintError` and returns:

- `content`: text message "Markdown lint issues prevented this note from being stored. Fix the specific lint errors listed below in your content and retry the remember call — the note was NOT stored.\n\n{err.message}"
- `structuredContent`: `LintErrorResult` with `action: "lint_error"`, `tool: "remember"`, `issues: err.issues`
- `isError: true`

**Why:** `cleanMarkdown` throws `MarkdownLintError` for unfixable lint. Without a catch, this propagates as a generic MCP error with no actionable guidance. LLMs see the error but don't know they should fix and retry.

### Fix 3: Add try/catch for MarkdownLintError in `update(content)` handler

**File:** `src/index.ts` (around line 3061)
**What:** Wrap `const cleanedContent = content === undefined ? undefined : await cleanMarkdown(content);` in a try/catch with the same dual-response pattern:

- `content`: text message "Markdown lint issues prevented the update. Fix the specific lint errors in your content and retry — do NOT fall back to semanticPatch for this.\n\n{err.message}"
- `structuredContent`: `LintErrorResult` with `action: "lint_error"`, `tool: "update"`, `issues: err.issues`
- `isError: true`

**Why:** Same problem as `remember`. The `update` handler already catches lint errors from `semanticPatch` but not from the `content` path. The "do NOT fall back to semanticPatch" text mirrors the existing semanticPatch lint error message pattern.

### Fix 4: Add markdown lint guidance to `content` parameter description

**File:** `src/index.ts`
**What:** Add a brief note to the `content` parameter description in both `remember` and `update` tools mentioning:

- Content must pass markdown lint (auto-fixable issues are fixed automatically)
- Common unfixable issues: fenced code blocks need language tags (e.g. use `text` not bare fences), broken links
- If lint fails, fix the specific issues listed in the error and retry

**Why:** Following the existing design principle from `semantic-patch-builder-design-implementation` — "Guidance at the Schema Level, Not Just Error Messages." Schema-level guidance fires before the handler runs, preventing wasted retries. MD040 is the most common LLM-triggered lint failure (fenced code blocks without language tags).

### Fix 5: Update the linting decision note

**What:** Update `markdown-linting-for-memory-content-259a1c85` to document the new error handling approach: `remember` and `update(content)` now catch `MarkdownLintError` and return structured errors with retry guidance + `LintErrorResult` structured content, mirroring the `semanticPatch` pattern.

## Checkboxes

- [ ] Add LintErrorResult interface and schema to structured-content.ts
- [ ] Add try/catch for MarkdownLintError in remember handler (text + structuredContent)
- [ ] Add try/catch for MarkdownLintError in update(content) handler (text + structuredContent)
- [ ] Add lint guidance to content parameter descriptions
- [ ] Update linting decision note
