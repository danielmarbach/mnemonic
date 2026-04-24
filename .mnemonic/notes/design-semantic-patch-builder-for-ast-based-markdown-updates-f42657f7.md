---
title: 'Design: Semantic Patch Builder for AST-Based Markdown Updates'
tags:
  - design
  - ast
  - semantic-patch
  - update
  - markdown
  - approved
lifecycle: permanent
createdAt: '2026-04-23T20:44:16.146Z'
updatedAt: '2026-04-24T05:20:24.718Z'
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
# Design: Semantic Patch Builder for AST-Based Markdown Updates

## Problem

The current `update` tool requires passing the entire note `content` back and forth even for trivial edits (appending a paragraph, changing a tag). This wastes tokens on large notes and unconditionally regenerates embeddings, which is wasteful when only a heading or a list item changed.

## Proposed Solution

A semantic patch layer on top of AST-based markdown editing. The `update` tool gains a new optional `semanticPatch` parameter (array of patch operations) as an alternative to `content`.

## Decision: No Silent Fallback

If `semanticPatch` is provided and fails (ambiguous selector, selector not found, patch produces invalid markdown), the tool **hard-fails** with a diagnostic error. It does NOT silently fall back to `content` replacement.

Rationale: the LLM generated the patch based on a specific note view. If that view changed (edited by another client, branch switch, concurrent update), falling back to full-body replacement risks overwriting newer changes with stale data. A hard fail lets the LLM `get` the current note and regenerate a corrected patch, or consciously switch to `content` if it wants a full rewrite.

## LLM Guidance to Prefer Semantic Patch

The `update` tool description is updated to prioritize `semanticPatch`:

- **Primary:** `semanticPatch` — for focused, token-efficient edits (append under heading, replace paragraph, insert list item)
- **Legacy/Fallback:** `content` — only for complete rewrites or very short notes

Parameter descriptions:

- `semanticPatch`: "Use this for targeted edits when you know the structure. More token-efficient than passing full content."
- `content`: "Full note body replacement. Use only for complete rewrites or when the note is small."

## Architecture (5 Layers)

1. **Parser** (`src/markdown-ast.ts`): `remark` / `unified` → `mdast`
2. **Query** (`src/semantic-patch.ts`): semantic selectors (heading text, nth child, last child)
3. **Patch** (`src/semantic-patch.ts`): typed operations (appendChild, prependChild, replace, insertAfter/Before, replaceChildren, remove)
4. **Serializer** (`src/markdown-ast.ts`): `mdast` → markdown string
5. **Lint**: reuse existing `src/markdown.ts` / `cleanMarkdown` post-serialization

## New Dependencies

- `unified`
- `remark-parse`
- `remark-stringify`

## Modified Tool Surface

`update` tool new parameter:

```ts
semanticPatch?: Array<{
  selector: { heading?: string; headingStartsWith?: string; nthChild?: number; lastChild?: true };
  operation: { op: "appendChild" | "prependChild" | "replace" | "replaceChildren" | "insertAfter" | "insertBefore" | "remove"; value?: string };
}>
```

If `semanticPatch` is present: read note → parse body → resolve selectors → apply patches → serialize → `cleanMarkdown` → write.

If `content` is present: existing behavior unchanged.

Parameter precedence: exactly one of `content` or `semanticPatch` must be provided. Providing both is an error.

## Embedding Optimization

- Body-changing patches → re-embed (same as today for `content` changes)
- Frontmatter-only changes (title, tags, alwaysLoad) → skip re-embed (already true today)
- Structural-only changes that don't alter text content → skip re-embed (new)

## Error Behavior

- `content` and `semanticPatch` both provided → error: "Exactly one of content or semanticPatch must be provided"
- Selector not found → error listing available headings
- Ambiguous selector → error listing matches
- Patch produces invalid markdown → lint and re-parse; still failing → reject before any disk write
- Any patch failure → no mutation; no commit; no fallback

## Token Savings

Full-content round-trips for 2000-token notes are replaced with ~50-token patch arrays for minor edits, even for moderate structural rewrites.

## Backward Compatibility

- `content` parameter stays exactly as-is
- `semanticPatch` is purely additive
- No existing tests or note formats change

## Open Question / Risk

AST round-trip via `remark` may change whitespace or formatting on notes that currently bypass markdownlint cleanly. Testing needed on existing vault notes before adoption.

## Status

Design approved for implementation.
