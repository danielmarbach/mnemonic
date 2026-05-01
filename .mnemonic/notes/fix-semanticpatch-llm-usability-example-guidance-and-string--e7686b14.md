---
title: 'Fix: semanticPatch LLM usability — example, guidance, and string preprocess'
tags:
  - semantic-patch
  - bug-fix
  - llm-usability
lifecycle: permanent
createdAt: '2026-05-01T11:48:36.821Z'
updatedAt: '2026-05-01T11:48:36.821Z'
role: decision
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
## Fix: semanticPatch LLM usability — three root causes

Three problems causing LLMs to waste tokens on `semanticPatch`:

1. **Schema example used rejected operations**: The example in the `semanticPatch` description showed `appendChild` and `replaceChildren` with `heading` selectors — both are rejected by `getTargetChildren()` returning `undefined` for heading nodes. LLMs copied the example and got immediate failures. Fixed by replacing with `insertAfter` and `replace`.

2. **Guidance text recommended rejected operations**: Line 2965 and line 6514 said "Use `appendChild` or `replace` instead" — but `appendChild` on headings also fails. Fixed to "Use `insertAfter` to add content under a heading, or `replace` to replace a heading entirely."

3. **No string preprocess**: LLMs frequently pass `semanticPatch` as a JSON string literal instead of a proper JSON array. Zod rejected with a generic type error. Fixed by adding `z.preprocess()` that attempts `JSON.parse()` on string inputs and falls through for unparseable strings (letting Zod produce its normal validation error).

### Validated operations on `heading` selectors

- `insertAfter` — add content below a heading (most common intent)
- `insertBefore` — add content above a heading
- `replace` — replace the heading node entirely
- `remove` — remove the heading

### Invalid operations on `heading` selectors (return clear error)

- `appendChild` — headings have inline text children, not block children
- `prependChild` — same reason
- `replaceChildren` — same reason

### Version

0.27.2
