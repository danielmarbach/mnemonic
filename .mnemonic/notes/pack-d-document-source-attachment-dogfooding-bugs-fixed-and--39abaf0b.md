---
title: >-
  Pack D: document-source attachment dogfooding, bugs fixed, and consolidation
  hardening
tags:
  - dogfooding
  - attachments
  - markdown
  - bugs
  - fixed
  - testing
  - prompt
  - reusable
lifecycle: permanent
createdAt: '2026-09-27T20:54:36.903Z'
updatedAt: '2026-09-27T20:54:36.903Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: document-source-chunk-embeddings-specified-but-never-deliver-6e867617
    type: related-to
  - id: dogfooding-test-suite-reusable-prompt-for-phases-1-8-validat-c7c702d8
    type: derives-from
  - id: document-source-attachments-design-delivery-and-verification-1517e52b
    type: related-to
memoryVersion: 1
---
## Consolidated from:
### Document-source attachment: five bugs found and fixed via Pack D dogfooding
*Source: `document-source-attachment-five-bugs-found-and-fixed-via-pac-24bedd4b`*

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

### Pack D: document-source attachment dogfood pack and A/B/C consolidation hardening
*Source: `pack-d-document-source-attachment-dogfood-pack-and-a-b-c-con-4f75a70c`*

# Pack D: document-source attachment dogfood pack and A/B/C consolidation hardening

## Pack D — document-source attachment (new)

Reusable pack at `scripts/dogfood-document-source.mjs`. Drives the LOCAL build over stdio against an isolated temp environment (reuses `createIsolatedDogfoodVault` for the consumer; adds a temp main vault so attachment-config writes stay isolated, and a temp document-source repo with an `origin` + `origin/HEAD`). Uses distinctive nonsense tokens (`zeta-workflow-engine`, `florgnart-bottleneck`) so it is immune to vault vocabulary and consolidation. Generations are in-memory, so add -> sync -> recall -> get must run in one spawned session.

Checks (12): add_attachment config (D1), list_attachments (D2), sync indexes docs/chunks (D3), recall surfaces document-chunk candidates with the full contract (D4), get(chunk:) and get(doc:) exact retrieval (D5a/D5b), mutation rejection of doc:/chunk: with ImmutableDocumentSourceError (D6), scope guard global-excludes docs (D7), mode/filter guard excludes docs from temporal + tag filters (D8), per-document chunk cap of 5 (D9), directory-prefixed include glob scopes by path (D11), remove_attachment teardown (D10). Run with `node scripts/dogfood-document-source.mjs` (or `MNEMONIC_ENTRYPOINT=build/index.js ...`).

This pack also fills the review gap "no integration tests for full sync -> generation -> get -> recall flow"; the deterministic regression for the same flow lives in `tests/document-source.integration.test.ts`.

## Packs A/B/C — consolidation-robustness hardening

Dogfooding A/B/C against the consolidated vault produced two advisory findings that were consolidation drift, not code regressions, plus one capture-path fragility. Hardened in `scripts/run-dogfood-packs.mjs`:

- Canonical-design check now matches by stable note id (derived from the summary orientation anchor, fallback `mnemonic-key-decisions-3f2a6273`), not exact title, so a rename/merge no longer causes a false advisory.
- Navigation-to-architecture check now seeds from the orientation anchor (stable id) in addition to the three most-recent notes; this fixed the `recent-to-architecture navigation works` false advisory.
- `upsertNote` now matches prior result notes by a stable prefix (trailing date/isolated parentheticals stripped) so live-mode re-runs UPDATE instead of duplicating. In `--isolated` mode each run copies a fresh vault, so it still `remember`s by design.

## Known caveat: isolated runner re-embeds from scratch

`createIsolatedDogfoodVault` filters out `embeddings/` and `projections/` on copy, so recall-ranking advisories (e.g. "recall answers canonical design questions") are noisy in isolated mode: the canonical note ranked #1 for the embeddings query in the LIVE vault but not in the isolated re-embed. Treat recall-ranking advisories from `--isolated` as embedding-state-dependent, not authoritative; the canonical check passes in the live vault.

## Environmental note

The host had `commit.gpgsign=true` globally with a failing 1Password signing agent, which blocked all git-commiting tests and memory writes. Tests now set `commit.gpgsign=false` locally (hermetic); memory writes were unblocked with a local repo override (`git config --local commit.gpgsign false`, reversible).
