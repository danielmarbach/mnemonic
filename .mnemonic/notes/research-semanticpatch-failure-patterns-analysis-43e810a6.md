---
title: 'Research: semanticPatch failure patterns analysis'
tags:
  - workflow
  - research
  - semantic-patch
  - bug
lifecycle: temporary
createdAt: '2026-05-01T11:27:01.925Z'
updatedAt: '2026-05-01T12:03:03.372Z'
role: research
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: review-semanticpatch-llm-usability-fixes-4d4022ce
    type: derives-from
  - id: plan-fix-semanticpatch-failure-patterns-5d3771af
    type: derives-from
memoryVersion: 1
---
## Failure pattern 1: JSON parsing error — string instead of array

LLMs (including strong models) pass `semanticPatch` as a JSON string literal instead of a JSON array. The MCP tool schema correctly defines it as `z.array(...)`, but LLMs serialize it as a string before invocation.

**Root cause:** LLM construction problem, not a transport bug. MCP JSON-RPC serializes arrays correctly. The LLM wraps the array in quotes.

**Current mitigations (already implemented):**

- Schema description includes explicit type unions and a 3-patch working example
- Workflow hint includes `### semanticPatch format` section with nesting example
- "Common mistake" callout showing flattening error
- "JSON array, NOT a string" reminder
- Selector error messages include format reminder with corrected example

**Assessment:** These mitigations address the symptom but the fundamental issue remains — LLM tool invocation frameworks sometimes serialize complex array parameters as strings. The Zod schema validates correctly at the server level, so malformed data gets caught, but the error experience is poor because the LLM gets an MCP validation error rather than a helpful diagnostic.

**Potential improvement directions:**

1. In the handler, detect when `semanticPatch` is a string and attempt `JSON.parse` with a helpful error message
2. Extend the Zod schema with a preprocess step that parses string inputs
3. Both of the above

## Failure pattern 2: appendChild/replaceChildren on heading nodes

When using `{ heading: "..." }` selector with `appendChild`, `prependChild`, or `replaceChildren`, the operation targets the heading node's own children (the heading text), not the body content below the heading.

**Root cause:** In mdast, a heading node's `children` are the inline text/phrasing content children, not the block content that follows the heading. This is correct AST semantics but counter-intuitive for LLMs who expect "append under heading" to add body content after the heading.

**Current mitigations (already implemented):**

- `getTargetChildren()` returns `undefined` for heading nodes, causing explicit errors
- Schema description and workflow hint provide guidance

**Bug found:** Both the schema description (line 2965) and workflow hint (line 6514) say to use `appendChild` on headings, but `appendChild` on headings is REJECTED by the code. The correct guidance should be: "Use `insertAfter` to add content under a heading."

**Fix for pattern 2:**

1. Fix the misleading documentation in both places to recommend `insertAfter` instead of `appendChild`
2. Consider whether `appendChild`/`prependChild`/`replaceChildren` on a heading selector should be auto-redirected to semantically equivalent operations instead of rejecting outright
