---
title: mnemonic embedding consistency verification
tags:
  - testing
  - embeddings
  - verification
  - quality
  - architecture
createdAt: '2026-03-07T23:26:43.327Z'
updatedAt: '2026-03-07T23:28:07.953Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mnemonic-consolidate-tool-design-b9cbac6a
    type: related-to
---
Comprehensive verification of embedding handling across all mutating MCP commands.

**Commands Verified:**

1. `remember` — Creates fresh embedding after writing note (best-effort, logs error on failure)
2. `update` — Regenerates embedding after content change (best-effort)
3. `forget` — `storage.deleteNote()` removes both note + embedding file
4. `move_memory` — Copies embedding to target vault, deletes from source
5. `relate/unrelate` — Correctly skips embedding update (metadata-only change)
6. `consolidate` (execute-merge) — Creates fresh embedding for consolidated note
7. `consolidate` (delete mode) — Deletes sources via `deleteNote()` (cleans embeddings)
8. `consolidate` (supersedes mode) — Keeps source embeddings (content unchanged)
9. `consolidate` (prune-superseded) — `deleteNote()` removes note + embedding

**Key Implementation Details:**

- `storage.deleteNote()` (lines 79-86) guarantees cleanup: `await fs.unlink(this.notePath(id))` + `await fs.unlink(this.embeddingPath(id))`
- Content changes trigger re-embedding via `embed()` + `writeEmbedding()`
- Metadata-only changes (relationships) skip embedding to avoid unnecessary compute
- Cross-vault operations preserve embeddings through `readEmbedding()` + `writeEmbedding()`
- All embedding operations are best-effort: failures are logged to stderr but don't block the operation

**Test Coverage Added:**
File: `tests/embeddings.test.ts` (9 tests, 26 total)

- Note creation without embedding requirement
- Embedding storage and retrieval
- `deleteNote()` cleans both note + embedding
- Delete gracefully handles missing embeddings
- Separate listing of notes vs embeddings
- Independent embedding updates
- Consistency through update cycles
- Cross-vault move operations

All 26 tests passing.
