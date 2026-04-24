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
updatedAt: '2026-04-24T19:12:40.313Z'
role: reference
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: plan-semanticpatch-lint-error-handling-improvements-2f54b5df
    type: derives-from
memoryVersion: 1
---
# Semantic Patch Builder: Design & Implementation

## Problem

The `update` tool required passing the entire note `content` for even trivial edits. This wasted tokens on large notes.

## Solution

AST-based semantic patch editing via `remark`/`unified`. The `update` tool gains an optional `semanticPatch` parameter (array of patch operations) as an alternative to `content`.

## Decision: No Silent Fallback

If `semanticPatch` fails (selector not found, invalid operation), the tool hard-fails with a diagnostic. No fallback to `content` replacement — a hard fail lets the LLM `get` the current note and regenerate.

## Decision: Lenient Lint for Patches Only

Markdown lint issues in `semanticPatch` values produce **advisory warnings**, not hard errors. The patch succeeds and the content is stored; warnings are surfaced in both the text response and `structuredContent.lintWarnings`.

This leniency is unique to the patch path for two reasons:

- Patch values are small fragments that pass through AST serialization (`remark-stringify`), which can introduce formatting quirks (e.g. picking a different thematic break style `---` vs `***`). A hard-fail on that trivial difference forces a wasteful retry.
- Structural errors (selector not found, invalid operation) still hard-fail with a clear "Semantic patch failed:" prefix and diagnostic. The LLM gets distinct guidance for each failure mode.

`remember` and `update` with full `content` still use strict lint validation — if the body has unfixable lint, it is rejected. The auto-fix loop in `cleanMarkdown` handles fixable issues for those paths.

## Decision: Guidance at the Schema Level, Not Just Error Messages

The "do NOT fall back to full content rewrite" guidance must be in the `semanticPatch` **parameter description**, not just in the `MarkdownLintError` message. Schema-level validation errors (malformed patches, wrong types) fire before the handler runs — the error message never reaches the LLM if it falls back before retrying. The parameter description is the only reliable channel.

## Architecture (5 Layers)

1. **Parser** (`src/markdown-ast.ts`): `remark` + `unified` → `mdast`. `remark-stringify` configured with `bullet: "-"`.
2. **Query** (`src/semantic-patch.ts`): selectors — `heading` (exact), `headingStartsWith`, `nthChild`, `lastChild`.
3. **Patch** (`src/semantic-patch.ts`): operations — `appendChild`, `prependChild`, `replace`, `replaceChildren`, `insertAfter`, `insertBefore`, `remove`.
4. **Serializer** (`src/markdown-ast.ts`): `mdast` → markdown.
5. **Lint**: `attemptCleanMarkdown` post-serialization (lenient, returns warnings instead of throwing).

## Lenient Lint for Patches Only

`attemptCleanMarkdown` (in `src/markdown.ts`) is a lenient variant that returns `{ cleaned, warnings }` instead of throwing on unfixable lint. `cleanMarkdown` is refactored to use it internally and throw on warnings — preserving strict behavior for `remember` and `update(content)`.

`applySemanticPatches` returns `Promise<{ content: string; lintWarnings: string[] }>`. The update handler distinguishes:

- `MarkdownLintError` → advisory "Fix the lint issues in your patch values and retry — do NOT fall back to full content rewrite"
- Structural errors (selector, operation) → "Semantic patch failed:" with diagnostic
- Lint warnings on success → surfaced in text response and `structuredContent.lintWarnings`

## Schema

Zod schema uses `z.discriminatedUnion` for operations (`remove` has no `value`; all others require `value`) and `.refine()` on selector to reject empty `{}`. Catches malformed LLM output early.

## Error Behavior

- `content` and `semanticPatch` both provided → error (metadata-only updates with neither are still allowed)
- Selector not found → error listing available headings (or "No headings in document")
- Structural errors (selector, operation) → "Semantic patch failed:" hard fail; no mutation; no commit
- Patch produces markdown with lint issues → success with advisory `lintWarnings` in response; content persisted
- `remember` and `update(content)` still hard-fail on unfixable lint
- Schema validation errors (malformed patch) → MCP validation error; guidance at schema level prevents fallback

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
- `attemptCleanMarkdown` and `cleanMarkdown` are both exported from `src/markdown.ts`; `cleanMarkdown` delegates to `attemptCleanMarkdown` and throws on warnings.

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
- `tests/semantic-patch.unit.test.ts` — 23 tests
- `tests/markdown.unit.test.ts` — 5 tests (added attemptCleanMarkdown)
- `tests/update-sem-patch.integration.test.ts` — 5 tests
- `scripts/run-dogfood-packs.mjs` — modified, added scenarios
- `CHANGELOG.md` — 0.24.0 entry

Total: 682 tests pass, typecheck clean.

## Backward Compatibility

- `content` parameter untouched (except both-provided validation)
- `semanticPatch` is purely additive
- No existing tests or note formats changed
- `applySemanticPatches` return type changed from `Promise<string>` to `Promise<{ content: string; lintWarnings: string[] }>` — internal only
