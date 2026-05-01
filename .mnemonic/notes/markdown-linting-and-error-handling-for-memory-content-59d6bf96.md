---
title: Markdown Linting and Error Handling for Memory Content
tags:
  - markdown
  - linting
  - decisions
  - error-handling
lifecycle: permanent
createdAt: '2026-05-01T19:56:54.769Z'
updatedAt: '2026-05-01T19:56:54.769Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mnemonic-key-design-decisions-3f2a6273
    type: related-to
memoryVersion: 1
---
# Markdown Linting and Error Handling for Memory Content

## Decision
Lint markdown note bodies during `remember` and `update` to ensure recalled content remains clean and consistent. Auto-apply fixable issues and reject unfixable ones to prevent low-quality markdown from being stored.

## Implementation Details
- **Linting Process**: Runs `markdownlint` before persisting content.
- **Configuration**: `MD013` (line length) and `MD041` (first line H1) are disabled as note bodies are content fragments.
- **Tool Integration**: `get`, `relate`, `unrelate`, and `forget` accept `cwd` for reliable project-vault resolution.

## Error Handling Pattern
To prevent LLMs from ignoring lint errors or assuming success, `remember` and `update(content)` use a structured error response:
- **Content**: Actionable text instructing the LLM to fix specific issues and retry, explicitly stating the note was NOT stored.
- **Structured Content**: Returns a `LintErrorResult` containing `action: "lint_error"`, the `tool` name, and a list of `issues`.
- **Schema Guidance**: The `content` parameter descriptions for both tools include proactive guidance on lint requirements and common failures (e.g., MD040 fenced code blocks requiring language tags).

This pattern mirrors the `semanticPatch` approach, providing guidance at both the schema and error levels.
