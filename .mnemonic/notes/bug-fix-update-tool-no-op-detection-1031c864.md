---
title: 'Bug fix: update tool no-op detection'
tags:
  - bug-fix
  - update
  - no-op
  - evidence
lifecycle: permanent
createdAt: '2026-04-26T17:18:33.611Z'
updatedAt: '2026-04-26T17:18:33.611Z'
role: decision
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
## Bug fixed: update tool created empty commits and wasted embeddings on no-op changes

The `update` tool unconditionally bumped `updatedAt`, wrote the note, re-embedded, and committed — even when no content or metadata actually changed. This produced git commits with only a frontmatter timestamp diff and wasted embedding computation.

### Root causes

1. **No content-change guard**: The handler always proceeded to write/commit/embed regardless of whether any field actually changed.
2. **Parameter presence vs actual change**: The `changes` array tracked parameter presence (e.g. `content !== undefined`) rather than actual value differences (e.g. `content !== note.content`).
3. **Metadata-only changes re-embedded**: Per the key design decisions note, "metadata-only changes don't re-embed" — but the code always re-embedded.

### Fix (src/update-detect-changes.ts + src/index.ts)

Extracted `hasActualChanges()` and `computeFieldsModified()` into a new module (`src/update-detect-changes.ts`) with:

- **Explicit-set semantics**: Fields like `role`, `tags`, `alwaysLoad` are only reported as changed when the caller explicitly provided them AND the value differs from the original.
- **semanticPatch is always a change**: Even if patch output equals original content, the fact a patch was applied is reported.
- **relatedTo auto-relationships count**: If `suggestAutoRelationships` adds new edges during update, that's a change.
- **No-op early return**: When `hasActualChanges()` returns false, the handler returns "No changes" without writing, embedding, or committing.
- **Metadata-only skip re-embed**: `shouldReembed` is `true` only when `patchedContent` or `cleanedContent` is set. Metadata-only updates skip embedding.

### Tests

- `tests/update-noop.unit.test.ts` — 37 unit tests for `hasActualChanges` and `computeFieldsModified`
- `tests/update-noop.integration.test.ts` — 6 integration tests covering no-op detection, updatedAt stability, embedding skip, fieldsModified accuracy
