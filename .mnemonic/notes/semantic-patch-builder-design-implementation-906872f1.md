---
title: 'Semantic Patch Builder: Design & Implementation'
tags:
  - design
  - ast
  - semantic-patch
  - update
  - markdown
  - plan
  - implementation
lifecycle: permanent
createdAt: '2026-04-24T11:09:39.750Z'
updatedAt: '2026-04-24T11:32:28.640Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
# Semantic Patch Builder: Design & Implementation

## Problem

The `update` tool required passing the entire note `content` for even trivial edits. This wasted tokens on large notes.

## Solution

AST-based semantic patch editing via `remark`/`unified`. The `update` tool gains an optional `semanticPatch` parameter (array of patch operations) as an alternative to `content`.

## Decision: No Silent Fallback

If `semanticPatch` fails (selector not found, lint error), the tool hard-fails with a diagnostic. No fallback to `content` replacement — a hard fail lets the LLM `get` the current note and regenerate.

## Architecture (5 Layers)

1. **Parser** (`src/markdown-ast.ts`): `remark` + `unified` → `mdast`. `remark-stringify` configured with `bullet: "-"`.
2. **Query** (`src/semantic-patch.ts`): selectors — `heading` (exact), `headingStartsWith`, `nthChild`, `lastChild`.
3. **Patch** (`src/semantic-patch.ts`): operations — `appendChild`, `prependChild`, `replace`, `replaceChildren`, `insertAfter`, `insertBefore`, `remove`.
4. **Serializer** (`src/markdown-ast.ts`): `mdast` → markdown.
5. **Lint**: `cleanMarkdown` post-serialization.

## Schema

Zod schema uses `z.discriminatedUnion` for operations (`remove` has no `value`; all others require `value`) and `.refine()` on selector to reject empty `{}`. Catches malformed LLM output early.

## Error Behavior

- `content` and `semanticPatch` both provided → error (metadata-only updates with neither are still allowed)
- Selector not found → error listing available headings (or "No headings in document")
- Patch produces invalid markdown → lint rejection; no mutation
- Any patch failure → no mutation; no commit; no fallback

## Empirical Token Savings

Measured against the actual design note (3291 bytes / approx. 823 tokens on disk). Wire payload includes id, cwd, allowProtectedBranch, plus the patch array.

| Scenario | Size | Savings |
| --- | --- | --- |
| Full note body | 3291 B | baseline |
| Small patch (1 line) | 232 B | 93% (14x) |
| Larger patch (2 sections) | 564 B | 83% (5.8x) |

For a 2000-token production note the ratio widens further since patch overhead stays constant. Verified via tests/dogfood-semantic-patch.mjs against build/index.js (7/7 checks passed).

## Implementation Details

- `replaceChildren` on a heading node replaces the heading *text*, not body content below it. Use `insertAfter` to add block content under a heading.
- `fieldsModified` reports `"semanticPatch"` as a separate entry.
- Conservative re-embed: body changes via patches trigger the same re-embed path as `content` changes.

## Dogfooding

`run-dogfood-packs.mjs` validates three scenarios:

- Multi-patch `insertAfter` under different headings
- Lint rejection on invalid markdown (`[broken](<>)`)
- Retry with valid patch succeeds after lint rejection (no mutation from the bad patch)

## Test Field

Checking fieldsModified.

## Files

- `src/markdown-ast.ts` — new, remark parse/serialize
- `src/semantic-patch.ts` — new, engine
- `src/index.ts` — modified, schema + handler
- `tests/markdown-ast.unit.test.ts` — 2 tests
- `tests/semantic-patch.unit.test.ts` — 22 tests
- `tests/update-sem-patch.integration.test.ts` — 5 tests
- `scripts/run-dogfood-packs.mjs` — modified, added scenarios
- `CHANGELOG.md` — 0.24.0 entry

Total: 665 tests pass, typecheck clean.

## Backward Compatibility

- `content` parameter untouched (except both-provided validation)
- `semanticPatch` is purely additive
- No existing tests or note formats changed
