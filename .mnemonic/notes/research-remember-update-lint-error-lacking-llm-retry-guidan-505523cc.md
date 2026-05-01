---
title: 'Research: Remember/Update lint error lacking LLM retry guidance'
tags:
  - workflow
  - research
  - linting
  - error-handling
lifecycle: temporary
createdAt: '2026-05-01T12:13:34.565Z'
updatedAt: '2026-05-01T12:14:40.977Z'
role: research
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: markdown-linting-for-memory-content-259a1c85
    type: related-to
  - id: plan-add-actionable-lint-error-guidance-to-remember-and-upda-86542d51
    type: derives-from
memoryVersion: 1
---
## Problem

When `remember` or `update(content)` fails due to markdown lint errors, the `MarkdownLintError` propagates as a raw MCP tool error with no actionable guidance. LLMs see the lint issues but:

1. Don't understand they should fix the specific lint errors and retry the same tool call
2. Sometimes carry on as if the note was successfully written
3. Don't get clear "this note was NOT stored" messaging

In contrast, `update(semanticPatch)` has explicit try/catch (lines 3048-3059 in `src/index.ts`) with actionable messages like "Fix the lint issues in your patch values and retry — do NOT fall back to full content rewrite."

## Root Cause

`remember` calls `cleanMarkdown(content)` at line 1963 with NO try/catch. `update(content)` calls `cleanMarkdown(content)` at line 3061 with NO try/catch. The `MarkdownLintError` just propagates as a generic MCP error.

`MarkdownLintError.message` format is:

```text
Markdown lint failed:
- line 200: MD040/fenced-code-language Fenced code blocks should have a language specified (```)
```

This tells the LLM *what* is wrong but not *what to do* (fix and retry).

## Contrast with semanticPatch

The `semanticPatch` path (lines 3048-3059) catches `MarkdownLintError` explicitly and returns:

```text
Semantic patch produced content with markdown lint issues. Fix the lint issues in your patch values and retry — do NOT fall back to full content rewrite.

Markdown lint failed:
- ...
```

This is returned as `{ content: [{ type: "text", text: message }], isError: true }` — a structured MCP error response, not an unhandled exception.

## What We Need

1. Wrap `cleanMarkdown` calls in `remember` and `update(content)` with try/catch for `MarkdownLintError`
2. Return a structured MCP error with clear guidance: fix the specific lint issues and retry
3. Make explicit that the note was NOT stored — the current raw error doesn't convey this clearly enough
4. Consider if the `content` parameter description should mention markdown lint requirements proactively (some lint rules like MD040 are common gotchas for LLMs generating fenced code blocks without language tags)

## Code Locations

- `src/markdown.ts:28-33` — `MarkdownLintError` class definition
- `src/markdown.ts:62-68` — `cleanMarkdown` throws on unfixable warnings
- `src/index.ts:1963` — `remember` handler calls `cleanMarkdown` without try/catch
- `src/index.ts:3061` — `update` handler calls `cleanMarkdown` for content path without try/catch
- `src/index.ts:3048-3059` — `update` handler for `semanticPatch` has proper try/catch with actionable message (reference implementation)

## Existing Design Decision

The permanent note `markdown-linting-for-memory-content-259a1c85` says:

- Auto-apply fixable issues, reject non-fixable issues after auto-fix
- MD013 (line length) and MD041 (first line H1) are disabled

The design is sound. The gap is in error communication, not in the linting logic itself.
