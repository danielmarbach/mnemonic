---
title: 'Review: heading child operations fix in semanticPatch'
tags:
  - review
  - semantic-patch
  - bugfix
lifecycle: temporary
createdAt: '2026-04-24T21:56:52.621Z'
updatedAt: '2026-04-24T22:21:33.797Z'
role: review
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: semantic-patch-builder-design-implementation-906872f1
    type: related-to
memoryVersion: 1
---
# Review: Fix heading child operations in semanticPatch

## What was found

The bug report: `appendChild`/`prependChild`/`replaceChildren` on a heading selector corrupted the note structure.

Root cause: `CONTAINER_TYPES` in `src/semantic-patch.ts` included `"heading"`, treating headings as container nodes. In mdast, headings hold inline/phrasing children only. `appendChild` on a heading injected block nodes (lists, paragraphs) into the heading's inline children, which `remark-stringify` serialized as malformed flat text on the same line as the heading marker.

## What was fixed

Single-line change: removed `"heading"` from `CONTAINER_TYPES`.

Result: heading-targeted `appendChild`, `prependChild`, and `replaceChildren` now throw a clear error (`Cannot appendChild to node of type 'heading'`), while `insertAfter` / `insertBefore` / `replace` / `remove` on headings continue to work correctly.

## Design alignment check

Against the design note (`semantic-patch-builder-design-implementation-906872f1`):

- ✅ Headings were never intended to be containers. The design note's original description of `replaceChildren` on a heading (“replaces the heading text”) was a workaround for the bug, not a design goal. Updated.
- ✅ `insertAfter` remains the correct operation to add content under a heading.
- ✅ Error behavior is consistent with “structural errors hard-fail with clean diagnostic.”
- ⚠️ No schema update needed — the schema already allows these operations on any selector. Runtime rejection is the right boundary.

## Tests

- Regression unit test added to `tests/semantic-patch.unit.test.ts` — replaced a test that was validating the buggy behavior with one that asserts all three child operations now reject on headings.
- Regression integration test added to `tests/update-sem-patch.integration.test.ts` — end-to-end MCP call confirming `appendChild` on a heading returns a clean error with no mutation.
- Full suite: 683 tests pass, typecheck clean.

## **Resolved** — fix committed in v0.25.3 (semantic-patch-placement branch). Single-line change: removed `"heading"` from `CONTAINER_TYPES`. 32 unit tests + 5 integration tests pass. Design note updated. Changelog and version bumped

continue — fix is minimal, well-tested, and design-aligned. Ready to merge.
