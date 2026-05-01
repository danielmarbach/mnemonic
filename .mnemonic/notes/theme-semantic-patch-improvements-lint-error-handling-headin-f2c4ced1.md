---
title: >-
  Theme: Semantic patch improvements — lint error handling, heading operations,
  and LLM usability
tags:
  - semantic-patch
  - design
  - theme
  - reference
  - llm-usability
lifecycle: permanent
createdAt: '2026-04-28T15:59:57.519Z'
updatedAt: '2026-04-28T15:59:57.519Z'
role: reference
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
# Theme: Semantic patch improvements — lint error handling, heading operations, and LLM usability

This note captures the iterative improvements to `semanticPatch` that went beyond the initial design.

## Problem: Three issues with the lint error flow

1. **No auto-fix for patch values**: When `attemptCleanMarkdown` returned unfixable lint in patch values, the patch succeeded with warnings. But some warnings were auto-fixable — the LLM should not need to retry for trivial formatting issues.

2. **Error message insufficient guidance**: The "do NOT fall back to full content rewrite" instruction was in the error message, not in the schema-level description. Schema-level validation errors fire before the handler runs — the error message never reaches the LLM if it falls back before retrying.

3. **LLM nesting and format errors**: LLMs frequently flattened `{selector, operation}` into `{op, value}` at the top level, or passed the entire array as a JSON string literal instead of a JSON array.

### Lint error resolution

- `attemptCleanMarkdown` now applies auto-fix for fixable issues in patch values
- Expanded parameter description with explicit type unions and a 3-patch working example
- Workflow hint includes `### semanticPatch format` section with nesting example and common-mistake callout
- Selector error messages include format reminder with corrected example

## Problem: Heading child operations

`appendChild`/`prependChild`/`replaceChildren` on a heading selector targeted the heading node text, not the body below it. This was correct in mdast but LLMs expected heading operations to affect content *under* the heading.

### Heading operations resolution

- `appendChild`, `prependChild`, and `replaceChildren` on a heading are rejected with a clear error
- Guidance added: use `insertAfter` to add block content under a heading
- `replaceChildren` on a heading replaces heading *text*, not body content below it
- Documentation updated in both parameter description and `mnemonic-workflow-hint`

## Related artifacts

- Initial design: `semantic-patch-builder-design-implementation-906872f1`
- Plan: `plan-semanticpatch-lint-error-handling-improvements-2f54b5df`
- Review (heading ops): `review-heading-child-operations-fix-in-semanticpatch-495f1061`
- Review (lint): `review-semanticpatch-lint-error-handling-improvements-02378fc4`
