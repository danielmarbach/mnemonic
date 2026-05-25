---
title: 'Semantic patch design, usability fixes, and known footguns'
tags:
  - semantic-patch
  - design
  - llm-usability
  - known-gaps
  - update
lifecycle: permanent
createdAt: '2026-05-25T17:25:55.146Z'
updatedAt: '2026-05-25T17:25:55.146Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mnemonic-key-design-decisions-3f2a6273
    type: related-to
memoryVersion: 1
---
Consolidate semantic patch design, LLM-usability improvements, heading semantics, and known section replacement footguns into one canonical note.

# Semantic patch design, usability fixes, and known footguns

Canonical note for mnemonic's `semanticPatch` support in the `update` tool. It consolidates the original design, later LLM-usability improvements, lint/error-handling behavior, heading-operation constraints, and remaining section-replacement footguns.

## Problem

The `update` tool originally required passing the full note body for small edits. That was token-inefficient for large notes and made targeted memory maintenance expensive.

## Solution

`update` supports an optional `semanticPatch` parameter as an alternative to full `content` replacement. A semantic patch is an array of `{ selector, operation }` objects applied to the Markdown AST.

## Architecture

- Parser: `src/markdown-ast.ts` uses `remark` and `unified` to parse markdown into `mdast`.
- Query: `src/semantic-patch.ts` resolves selectors such as `heading`, `headingStartsWith`, `nthChild`, `lastChild`, and section-level selectors where supported.
- Patch: `src/semantic-patch.ts` applies operations such as `appendChild`, `prependChild`, `replace`, `replaceChildren`, `insertAfter`, `insertBefore`, `remove`, and section-aware operations where implemented.
- Serializer: `src/markdown-ast.ts` serializes the patched `mdast` back to markdown.
- Lint: `attemptCleanMarkdown` cleans fixable markdown issues and reports remaining issues.

## Design Decisions

- No silent fallback: if a `semanticPatch` fails, `update` hard-fails so the caller must inspect the current note and regenerate the patch.
- Avoid full-content fallback loops: schema and error guidance explicitly tell agents not to fall back to full note rewrites after patch failures.
- Patch values receive lenient lint handling: fixable issues are auto-fixed; remaining issues are surfaced as warnings or errors according to the patch path's current behavior.
- Schema-level guidance is critical because validation errors can occur before handler-level error messages are available.
- Zod preprocessing accepts a JSON string literal for the patch array because LLMs sometimes pass arrays as serialized strings.
- Parameter descriptions include explicit type unions and examples to reduce malformed `{ selector, operation }` nesting.

## Implemented LLM Usability Fixes

- Added preprocessing for JSON-stringified semantic patch arrays.
- Expanded schema descriptions with explicit union shapes and a multi-patch working example.
- Added workflow-hint documentation for `semanticPatch` format, nesting, and common mistakes.
- Added selector error messages with corrected patch examples.
- Added heading operation constraints to reject misleading child operations on heading selectors.

## Heading Operation Semantics

Heading selectors select the heading node itself, not the section body under the heading.

This means:

- `replace` on `{ heading: "X" }` replaces only the heading node.
- `insertAfter` on `{ heading: "X" }` inserts nodes immediately after the heading and leaves the existing section body intact.
- `appendChild`, `prependChild`, and `replaceChildren` on heading selectors are rejected because they would target heading text internals, not section content.
- To add block content below a heading, use `insertAfter`.
- To replace an entire section, use a section-aware selector/operation instead of heading-level node replacement.

## Known Footgun: Section Replacement

Repeated duplicate-section issues come from user intent not matching node-level patch semantics. A heading selector resolves to one top-level Markdown AST node. Operations such as `replace` and `insertAfter` do not remove sibling nodes until the next heading. For checklist or workflow sections, this can leave the new section followed by the old section body.

## Preferred Mitigation

Implement or consistently use a real section-level operation, for example:

```json
{
  "selector": { "section": "Verification" },
  "operation": { "op": "replaceSection", "value": "## Verification\n\nUpdated content." }
}
```

The section operation should replace the selected heading plus all following nodes until the next heading of the same or higher depth.

## Additional Mitigations To Consider

- Guard heading `replace` when the replacement value includes the same heading; suggest `replaceSection` instead.
- Add duplicate-section detection after patch application for repeated headings, repeated checklist bodies, or completed checklist items followed by equivalent original unchecked items.
- Rename or alias node-level operations to expose the model, such as `replaceNode`, `insertNodeAfter`, and `insertNodeBefore`.
- Add dry-run diagnostics that explain whether a patch will leave the existing section body intact.
- Use full-content rewrite as an operational workaround for complex multi-section checklist updates when section-aware patching is unavailable.

## Verification

- Semantic patch behavior is covered by `tests/semantic-patch.unit.test.ts` and integration tests.
- Small one-line patches were observed to reduce payload size by roughly 93% compared with full note body replacement.

## Current Guidance

Prefer `semanticPatch` for targeted edits. Use section-aware operations for replacing sections. Do not use heading-level `replace` or `insertAfter` when the intent is to replace the whole section body.
