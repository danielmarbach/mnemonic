---
title: 'Document-source attachment: five bugs found and fixed via Pack D dogfooding'
tags:
  - dogfooding
  - attachments
  - markdown
  - bugs
  - fixed
lifecycle: permanent
createdAt: '2026-07-29T21:44:03.817Z'
updatedAt: '2026-08-01T20:35:22.137Z'
role: review
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: pack-d-document-source-attachment-dogfood-pack-and-a-b-c-con-4f75a70c
    type: related-to
  - id: document-source-chunk-embeddings-specified-but-never-deliver-6e867617
    type: related-to
memoryVersion: 1
---
# Document-source attachment: five bugs found and fixed via Pack D dogfooding

Dogfooding the newly added read-only markdown (document-source) attachment feature against the LOCAL build (`scripts/dogfood-document-source.mjs`, Pack D) found five defects that broke the end-to-end contract. All are fixed with unit/integration tests; Pack D is 12/12 green and the full suite is 1305 green.

## Bug 1 — include-glob parser corrupted directory-prefixed globs (silent zero indexing)

`src/document-sync.ts` parsed include globs via `pattern.replace("**/*.", "")`, which for `docs/**/*.md` produced ext `"docs/md"` (matching suffix `".docs/md"`) and indexed zero files with no error or skipped-file diagnostic. Only the bare default `**/*.md` worked, and even then the directory prefix was ignored (extension-only filtering). Exclude matching was equally naive and the default bare-name excludes (`node_modules`, etc.) matched nothing.

Fix: new path-aware `src/glob-match.ts` (`**` crosses `/`, `*` within a segment, bare-name convention matches any segment); wired into include and exclude in `document-sync.ts`. Unit tests: `tests/glob-match.unit.test.ts` (28 cases).

## Bug 2 — recall aborted when the query embedding failed

`src/tools/recall.ts` did `const queryVec = await embed(query)` with no fail-soft, so when the embed model was unavailable (Ollama down, model not pulled, quota) the whole tool threw. This blocked the lexical-only document-source chunks even though they need no embeddings, inconsistent with the fail-soft `embedMissingNotes` two lines below.

Fix: wrap in `attempt("recall:embed-query", ...)`; when null, skip the semantic scoring loop but keep the lexical projection channel and document chunks. Regression test: `tests/document-source.integration.test.ts` (500-returning embedder).

## Bug 3 — get/forget/update/move-memory schemas rejected doc:/chunk: handles

`NoteIdSchema` (`/^[a-zA-Z0-9_-]+$/`) excluded `:`, so `doc:`/`chunk:` retrieval handles were rejected at Zod validation before the handler (and its `classifyEntityRef`/`guardAgainstDocumentSourceMutation`) ran. Stage 3 exact-retrieval and Stage 4 mutation-rejection were unreachable via MCP; recall emitted `chunk:` handles that `get` could not consume, and `forget(doc:…)` returned a schema error instead of `ImmutableDocumentSourceError`. The `get` tool description even advertised accepting these handles.

Fix: added `EntityRefSchema` (`^([a-zA-Z0-9_-]+|(doc|chunk):.+)$`) in `structured-content.ts`; swapped `get`/`forget`/`update`/`move-memory` to it (`relate`/`unrelate` already used `z.string()`). The pre-existing guards now fire and return the immutable error.

## Bug 4 — chunk entity-ref parser kept the prefix and truncated documentId

`src/document-entity-ref.ts` `parseEntityRef` set `chunkId: id` (the full `chunk:…` string) but `generation.chunks` is keyed by the chunkId WITHOUT the prefix, so `get(chunk:…)` always missed; it also sliced `documentId` to the first segment (just the attachmentId) instead of `attachmentId::normalizedPath`.

Fix: `chunkId` is now the prefix-stripped id; `documentId` is the first two `::` segments. Updated `tests/document-entity-ref.unit.test.ts`.

## Bug 5 — recall returned early before collecting document chunks

`src/tools/recall.ts` returned "No memories found" when `top.length === 0` BEFORE the document-chunk block, so document-source chunks were silently dropped exactly when they matter most (no memory matches). Pack D's consumer had 110 notes so `top` was never empty, which hid this; an empty consumer returned zero chunks.

Fix: collect document chunks before the early return; gate the early return on `top.length === 0 && documentChunks.length === 0`.

## Secondary cleanups

- Snapshot `tests/__snapshots__/mcp-schema-contract.integration.test.ts.snap` refreshed for intentional document-source contract changes.
- Test hermeticity: `initTestRepo`/`initTestVaultRepo`/attached-vault fixtures now set `commit.gpgsign=false` so tests do not depend on the host GPG/SSH signing agent.
- Latent/masked: `document-recall.ts` still sets candidate `sourcePath` to the commit hash; masked because recall/get override from the document's real sourcePath, but worth cleaning up later.
- `sync` structured output omits document-source results (text-only); minor gap vs the text+structured rule.

## Verification

- Pack D (`scripts/dogfood-document-source.mjs`): 12/12 green against the local build.
- `npm test`: 75 files / 1305 tests green (snapshot updated).
- `npm run lint` and `npm run typecheck`: clean.
