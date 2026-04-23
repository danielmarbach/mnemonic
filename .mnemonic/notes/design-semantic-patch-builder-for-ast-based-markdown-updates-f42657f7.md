---
title: 'Design: Semantic Patch Builder for AST-Based Markdown Updates'
tags:
  - design
  - ast
  - semantic-patch
  - update
  - markdown
lifecycle: permanent
createdAt: '2026-04-23T20:44:16.146Z'
updatedAt: '2026-04-23T20:44:16.146Z'
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

## Embedding Optimization

- Body-changing patches → re-embed (same as today for `content` changes)
- Frontmatter-only changes (title, tags, alwaysLoad) → skip re-embed (already true today)
- Structural-only changes that don't alter text content → skip re-embed (new)

## Error Behavior

- Selector not found → error listing available headings
- Ambiguous selector → error listing matches
- Patch produces invalid markdown → lint and re-parse; still failing → reject before any disk write
- Any patch failure → no mutation; no commit

## Token Savings

Full-content round-trips for 2000-token notes are replaced with ~50-token patch arrays for minor edits, even for moderate structural rewrites.

## Backward Compatibility

- `content` parameter stays exactly as-is
- `semanticPatch` is purely additive
- No existing tests or note formats change

## Open Question / Risk

AST round-trip via `remark` may change whitespace or formatting on notes that currently bypass markdownlint cleanly. Testing needed on existing vault notes before adoption.

## Status

Design stage. Not yet approved for implementation.
