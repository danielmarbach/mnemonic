---
title: >-
  Document-source chunk embeddings: storage layout, hashing, and global-policy
  fallback
tags:
  - decision
  - attachments
  - document-source
  - embeddings
  - retrieval
  - storage
  - global-policy
  - design
  - path-layout
lifecycle: permanent
createdAt: '2026-09-27T20:54:35.706Z'
updatedAt: '2026-09-27T20:54:35.706Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: vault-creation-audit-which-tools-can-create-mnemonic-and-whi-d0388691
    type: related-to
  - id: review-lazy-document-generation-loading-needs-concurrency-an-b49cd0cd
    type: follows
memoryVersion: 1
---
## Consolidated from:
### Chunk embedding path layout: drop redundant guid prefix, lowercase filenames, reconcile on schema change
*Source: `chunk-embedding-path-layout-drop-redundant-guid-prefix-lower-6b739d42`*

# Chunk embedding path layout: drop redundant guid prefix, lowercase filenames, reconcile on schema change

Refined the document-source chunk embedding on-disk layout in `src/chunk-embedding-storage.ts`, `src/document-sync.ts`, and `src/document-source-index.ts`. `indexSchemaVersion` bumped 2→3 to invalidate prior caches. The authoritative chunkId format (the `::`-separated id stored in JSON) is unchanged.

## Why

Files lived at `.mnemonic/embeddings/doc-source/<attachmentId>/<slug(chunkId)>.json`, but `chunkId` itself is derived as `<attachmentId>::<path>::<headings>::<dup>::<ordinal>`. After slugifying (`::` → `-`) every filename redundantly carried the same guid already used as the parent folder. Measured: 2986 files in one attachment dir, ~20% shorter paths (~110 KB saved). Mixed-case also leaked from source paths (`README`) and heading text (`Azure`, `PaaS`).

## Decisions

1. **Strip the attachment-id prefix.** `ChunkEmbeddingStorage` now takes `(dir, attachmentId)`; `pathFor` strips the leading `<attachmentId>::` before slugifying. Safe because storage is always constructed per-attachment (`document-sync.ts`) and `remove-attachment` wipes the whole `<attachmentId>/` dir. The slug is already non-injective (`::`, `/`, and spaces all → `-`), so the filename was never a faithful chunkId encoding anyway; the authoritative chunkId lives inside the JSON.

2. **Lowercase in `pathFor` only — never in the shared `normalizePathToSlug`.** `normalizePathToSlug` (`src/retrieval-document.ts`) is shared with id derivation (`deriveDocumentId`, `deriveChunkId`, `buildDocumentRef`); lowercasing it would change the `::`-separated chunkId stored in JSON and used for tie-breaks / Map keys — breaking the id contract. The `.toLowerCase()` lives only inside `ChunkEmbeddingStorage.pathFor`. Rationale: macOS APFS and Windows NTFS are case-insensitive by default (latent collision risk); Linux ext4 is case-sensitive. Lowercasing makes filenames deterministic cross-platform.

3. **`pathFor` made public** so tests can target the canonical path when injecting corrupt / shape-mismatch files (tests already imported `normalizePathToSlug` for this, so it is consistent with existing test philosophy).

4. **`reconcile()` unlinks by the actual on-disk path.** A version bump rebuilds and re-embeds but does NOT delete old files: reuse via `read()` misses at new canonical paths → re-embed writes new-named files alongside; `sweepStaleChunkEmbeddings` only removes files whose chunkId is gone, and legacy files carry valid chunkIds; `remove()` targets the canonical name so it can never unlink a legacy file; `list()` discards the real filename. So legacy files are unreachable orphans. `reconcile` fixes this by readdir + read + unlink-by-actual-path, removing a file when it is stale OR `basename(pathFor(chunkId)) !== file`. Fail-soft: corrupt/unreadable files are left in place (mirrors `list()`).

5. **Rename-cleanup gated to schema-version change only.** Stale removal runs every sync (cheap, original behavior); rename-removal is opt-in via `removeNonCanonical`. The caller passes `schemaChanged = previousSchemaVersion !== generation.manifest.indexSchemaVersion`, so the basename comparison runs exactly once (on the migration sync) then never again.

## Safety of the schemaChanged gate

`previousSchemaVersion` is captured from `currentGen?.manifest.indexSchemaVersion` at the point `currentGen` is declared, before the `isGenerationCurrent` type guard narrows it (without this, TS narrows `currentGen` to `never`). `currentGen` is `const` and never reassigned (the post-publish generation is a separate `generation` variable), so it is a faithful pre-rebuild snapshot.

| Scenario | previous | new | schemaChanged | reconcile effect |
| --- | --- | --- | --- | --- |
| first sync, empty dir | undefined | 3 | true | reads 0 files, no-op |
| orphaned dir, no manifest | undefined | 3 | true | cleans legacy, re-embeds (self-heals) |
| same-schema re-sync | 3 | 3 | false | stale-only, zero extra work |
| migration 2→3 | 2 | 3 | true | one-time legacy cleanup |

Two invariants guarantee safety even when schemaChanged is spuriously true: (a) freshly-written canonical files always survive, because a file's basename equals `pathFor(its chunkId)` by construction; (b) the dir always exists by then (`init()` runs before `embedGenerationChunks` before `sweepStaleChunkEmbeddings`, all inside one `attempt` block, so if `init` fails reconcile is never reached). `removeNonCanonical` can ONLY ever delete genuinely legacy-named files.

## Tradeoffs / residual notes

- Slug stays non-injective; hash-based names would be truly injective but lose readability — judged overkill given guid+path+heading uniqueness.
- `pathFor` is now public API (minor filesystem-detail leak; justified by test ergonomics).
- Migration is automatic (no manual `rm -rf`): the first sync after upgrade re-embeds at the new names and sweeps the old ones, because `schemaChanged` is true on the 2→3 boundary.
- `reconcile` does one readdir + per-file read pass per sync (same order of cost as the original `list()`-based sweep it replaces; the rename check is a free piggyback, now gated off on non-migration syncs).

### Document-source chunk embeddings use xxh128 for filenames and content hashes
*Source: `document-source-chunk-embeddings-use-xxh128-for-filenames-an-e3e988b8`*

Document-source chunk embedding cache files are now named by an **xxh128 digest** of the chunkId suffix, and the per-chunk **content hash is also xxh128**. Both sites had been slug-based / SHA-256 by accident; this makes one deliberate non-cryptographic hash the single source of truth. Reverses the "hash-based names judged overkill" residual in `chunk-embedding-path-layout-drop-redundant-guid-prefix-lower-6b739d42`.

## Why

The slug filename was unbounded: a chunkId is `<attachmentId>::<path>::<headings>::<dup>::<ordinal>`, and after slugifying the whole thing collapses into **one filename component**. Document-source markdown lives in arbitrarily deep paths with long heading ancestry, so that single component can blow past the 255-byte limit shared by APFS/ext4/NTFS (and NTFS caps total path at 260). This is unique to document sources — note-embedding filenames are short GUIDs. f87b0a6c's prefix-strip + lowercase reduced length but never bounded it.

The SHA-256 content hash (`document-sync.ts:169`) was an arbitrary default, never a deliberate choice. "It's already imported" is not a justification when the prior choice was itself accidental.

Retrieval is unaffected by either change: `collectDocumentChunkCandidates` keys on the in-memory `chunkEmbeddings` Map by the **chunkId stored in the JSON payload** — never the filename. As long as the filename is a deterministic function of the chunkId, slug, hash, or anything else works.

## Decisions

1. **Filename = `xxh128(chunkIdSuffix)`** (32 hex chars, fixed length → path-limit-safe regardless of source depth or heading ancestry). The `<attachmentId>::` prefix is still stripped before hashing, consistent with v3's per-attachment-directory scoping. `ChunkEmbeddingStorage` keeps its `(dir, attachmentId)` constructor.

2. **Content hash = `xxh128(projectionText)`**, replacing SHA-256. Unifies both sites under one deliberate non-cryptographic hash.

3. **128-bit, not 64-bit.** xxh64 was considered and rejected: at `maxTotalChunks: 50000` a 64-bit hash has birthday-collision probability \~7×10⁻¹¹. For filenames a collision silently clobbers one chunk's embedding (retrieval degrades to lexical-only for that chunk; reconcile cannot detect it). For content a collision causes a false cache-hit (wrong vector reused for a changed chunk). 128-bit removes both concerns entirely.

4. **xxh128 over SHA-256** because SHA-256's prior use was arbitrary and xxh128 is the purpose-built tool for content addressing at this scale. xxh128 over xxh64 for the collision-proofing above.

5. **Dependency: `hash-wasm`.** `node:crypto` ships no non-cryptographic 128-bit hash (confirmed on Node 25.2.1). `xxhash-wasm` was tried first but its v1.x exposes only 32/64-bit variants, so `hash-wasm` (real XXH3-128 via `xxhash128`) is used instead. Hashing speed is not the bottleneck — the embed loop's per-chunk sequential `storage.read()` I/O dominates — but using the right tool is worth a tiny dep.

## Implementation consequences

- **`pathFor` is now async** (`Promise<string>`): `hash-wasm`'s `xxhash128` lazily compiles its WASM on first use, so the hash is a `Promise`. Every caller (`read`, `write`, `remove`, `reconcile`) was already async, so this is a contained change; the few tests that called `pathFor` synchronously now `await` it.

- **`list()` must read files directly** instead of round-tripping the basename through `read()`/`pathFor()`. The slug was idempotent (`slug(slug(x)) === slug(x)`), so the old round-trip worked by coincidence; a hash is NOT idempotent (`hash(hash(x)) !== hash(x)`), so the round-trip would hash the hex filename again and miss the file. `read(chunkId)` (takes the real chunkId) and `reconcile()` (already reads directly) keep working unchanged. The fix mirrors `reconcile`'s direct-read approach.

- **`reconcile(removeNonCanonical)` stays.** It is NOT moot pre-ship: v2 slug-named files DID ship in 0.40.0, so upgrading users have v2 files to clean up. Whether v3 names them slug or xxh128, the v2→v3 migration needs the basename-mismatch cleanup. The re-embed is already forced by the filename change (`storage.read` computes the new path, file sits at the old v2 name → read misses → `existing` null → re-embed), so folding the contentHash switch into the same release costs nothing extra — users re-embed once, and the new xxh128 content hash is written during that same pass.

- **No separate `indexSchemaVersion` bump** for the contentHash change; it rides the existing v2→v3 bump from f87b0a6c.

## What changes

- `src/hashing.ts` (new): shared `xxh128(input)` wrapper over `hash-wasm`'s `xxhash128`.
- `src/chunk-embedding-storage.ts`: `pathFor` is async and uses `xxh128(suffix)`; `read`/`write`/`remove`/`reconcile` `await` it; `list()` reads files directly (not via `pathFor`); contentHash comment updated (no longer "hex sha256").
- `src/document-sync.ts`: content hash at `:169` uses `await xxh128(...)`; `createHash` import dropped.
- New `hash-wasm` dependency.
- Tests updated: filename assertion becomes the xxh128 digest; `pathFor` calls awaited; reconcile legacy-file test still valid (v2 slug names are the legacy).

### Document-source embeddings for global-policy projects: main-vault fallback and lazy generation loading
*Source: `document-source-embeddings-for-global-policy-projects-main-v-ff2954f1`*

# Document-source embeddings for global-policy projects: main-vault fallback and lazy generation loading

## Problem

Document-source chunk embeddings were stored under `.mnemonic/embeddings/doc-source/<attachmentId>/`, requiring the project vault (`.mnemonic/`) to exist. Projects with global storage policy never create `.mnemonic/` — `getOrCreateProjectVault` is only called from `remember` (scope: project) and `move_memory`. The unadopted-project principle (`vault-creation-audit-which-tools-can-create-mnemonic-and-whi-d0388691`) intentionally prevents silent `.mnemonic/` creation.

Result: for global-policy projects, `syncDocumentSource` received `projectEmbeddingsDir = undefined` (from `getProjectVaultIfExists` returning null), so the embedding block was skipped entirely. Document sources were limited to lexical-only retrieval — the fail-soft fallback the spec described, not the intended primary path (`document-source-chunk-embeddings-specified-but-never-deliver-6e867617`).

A second problem compounded the first: `DocumentGeneration` is in-memory only (module-level `Map` in `generation-storage.ts`). After every MCP server restart, generations vanish and recall returns no document chunks until the user manually runs `sync` to rebuild them.

## Decision 1: Main-vault fallback for chunk embeddings (implemented, committed 034f6c8)

When the project vault doesn't exist, store document-source chunk embeddings in the main vault, namespaced by project ID:

```text
~/mnemonic-vault/embeddings/doc-source/<projectId>/<attachmentId>/
```

The `syncDocumentSource` parameter was renamed `projectEmbeddingsDir` → `docSourceBase` to clarify it's the full doc-source embeddings base directory (including the `doc-source` segment and optional project-ID namespacing), not the raw vault embeddings directory. The caller (`sync.ts`) constructs the path:

- Project vault exists: `path.join(projectVault.storage.embeddingsDir, "doc-source")`
- Project vault missing: `path.join(mainVault.storage.embeddingsDir, "doc-source", project.id)`

`remove-attachment` tries both locations (project vault + main vault fallback) for cleanup — `fs.rm` with `force: true` is a no-op for non-existent paths, so this also handles the edge case where storage policy changed between when embeddings were stored and when the attachment is removed.

### Alternatives considered for Decision 1

1. **Create a minimal `.mnemonic/embeddings/` without full vault** — rejected because `.mnemonic/` existence is the adoption signal for `resolveWriteScope()`. Creating it would cause `remember` to default to "project" instead of "ask", violating the unadopted-project principle.
2. **Separate per-project embeddings cache** (e.g., `~/mnemonic-vault/embeddings/projects/<projectId>/doc-source/<attachmentId>/`) — rejected as more complex than necessary; the simpler namespacing by project ID directly under `doc-source/` achieves the same isolation.
3. **Make sync create the project vault on-demand for document sources** — rejected for the same reason as alternative 1.

### Tradeoffs

- Main vault grows with document-source embeddings (gitignored, re-computable — same as note embeddings)
- Embeddings not co-located with the project (acceptable: embeddings are derived state, never committed)
- Need namespacing by project ID to avoid collisions between projects (handled by the path construction)

## Decision 2: Lazy generation loading via persisted manifest (not yet implemented)

The ephemeral generation issue (`DocumentGeneration` is in-memory only, lost on restart) was analyzed extensively. Multiple approaches were considered and rejected before arriving at the chosen design.

### Alternatives considered for Decision 2

1. **`autoSync` as a per-project setting, triggering full `sync` on recall** — rejected for two reasons:
   - **Naming inconsistency**: `sync` is a generic capability covering vaults, mnemonic-vault attachments, and document sources. An `autoSync` setting that only covers document sources is confusing — users would expect it to sync everything.
   - **Not really sync**: If `autoSync` only rebuilds the in-memory generation from the last known commit (no `git fetch`, no network), it's not "sync" — it's just loading data that should have been persisted. Calling it "sync" misrepresents what it does.

2. **`autoSync` as a general setting triggering full `sync` (including git fetch) on recall** — rejected because:
   - Network I/O on recall could add seconds of latency
   - Requires timeout handling to prevent recall from blocking indefinitely
   - Users opted into document sources, not into network I/O on every recall

3. **Persist the full `DocumentGeneration` to disk** (e.g., `generation.json` containing chunks, documents, content) — rejected because it would duplicate all markdown content locally. The source files already exist in the git repo. Copying them into a generation file defeats the purpose of document sources being a lightweight, non-copying retrieval layer.

4. **Require manual `sync` after every restart** (status quo) — rejected as poor UX. Users expect recall to work without manual intervention, especially after the main-vault fallback makes embeddings available for global-policy projects.

### Chosen approach: Persist a tiny manifest, rebuild from git on demand

At the end of a successful `syncDocumentSource`, write a small manifest file alongside the chunk embeddings:

```text
<embeddingsDir>/doc-source/<attachmentId>/manifest.json
```

Contents: `indexedCommit`, `indexSchemaVersion`, `embeddingCompatibilityIdentity`, `documentCount`, `chunkCount`. A few hundred bytes — not content.

On recall, when `getCurrentGeneration(attachmentId)` returns null:

1. Read the manifest from disk (one tiny file)
2. Rebuild the generation from git at the known commit — `git ls-tree` + `git show` per file (local only, no network)
3. Load chunk embeddings from existing disk files (content-hash reuse, no re-embedding)
4. Assemble and publish the in-memory `DocumentGeneration`
5. Proceed with recall

If no manifest exists (never synced, or cleaned up): skip — no chunks for that attachment. User runs `sync` first.

### Why this works

- **No content duplication**: content stays in the git repo. The manifest is a bookmark, not a copy.
- **No network I/O**: we read from the local git repo at the known commit. No `git fetch`.
- **No new user-facing setting**: no `autoSync` in `ProjectMemoryPolicy`, no naming problem. It's just lazy loading from the source on first access — the same pattern as loading notes from `.md` files.
- **No timeout concern**: the operation is bounded local I/O. For a moderate repo (~100 files), ~200ms-500ms. For a large repo (~1000 files), ~1-2s. Once per session; subsequent recalls are O(1).
- **Existing cleanup covers it**: `remove-attachment` already `fs.rm`s the entire `<attachmentId>/` directory — the manifest lives there.
- **Manual sync still needed for new commits**: lazy loading rebuilds at the last known commit, not HEAD. Staying up-to-date with remote requires manual `sync` (which does `git fetch`). This is acceptable — the problem was the ephemeral generation, not stale content.

### Relationship to the plan note

The plan note (`plan-deliver-document-source-chunk-semantic-retrieval-embedd-dba90b71`) explicitly chose "DocumentGeneration stays in-memory; chunk embeddings persist to disk separately." This decision didn't account for the restart scenario. The manifest approach doesn't violate that decision — the generation is still in-memory for the session, and the chunks are still rebuilt from the git repo (not persisted as a copy). The manifest is just enough persisted state to know *which commit* to rebuild from, not the generation itself.

## Implementation status

- Decision 1 (main-vault fallback): implemented and committed (034f6c8). Tests pass (1415 tests, typecheck, lint clean).
- Decision 2 (lazy generation loading): not yet implemented. Design agreed. Implementation requires:
  1. Write manifest file at end of `syncDocumentSource`
  2. Loader function: read manifest + rebuild generation from git + load embeddings from disk
  3. `recall.ts`: call loader when `getCurrentGeneration()` returns null
  4. Tests: verify recall works after simulated restart (clear in-memory generations, recall, verify chunks returned)

### Flatten doc-source embeddings path: drop redundant projectId segment
*Source: `flatten-doc-source-embeddings-path-drop-redundant-projectid--c8c5824f`*

# Flatten doc-source embeddings path: drop redundant projectId segment

## Context

The main-vault fallback path for document-source chunk embeddings included a `projectId` directory segment derived from the git remote URL:

```text
~/mnemonic-vault/embeddings/doc-source/{projectId}/{attachmentId}/
```

The `projectId` was the slugified remote URL (e.g. `github-com-particular-nservicebus`, ~40 chars). The `attachmentId` is a UUID (v4), so the project namespace was redundant for uniqueness. It only provided organizational grouping and bulk cleanup, both also achievable via the attachment config.

## Decision

Remove the `projectId` segment. The path is now `doc-source/{attachmentId}/` in all cases:

```text
Project vault: .mnemonic/embeddings/doc-source/{attachmentId}/
Main fallback: ~/mnemonic-vault/embeddings/doc-source/{attachmentId}/
```

The `resolveDocSourceBase` function in `document-manifest.ts` dropped its `projectId` parameter. All callers in `sync.ts`, `recall.ts`, `get.ts`, and `remove-attachment.ts` were updated.

## Why

1. Redundant uniqueness — `attachmentId` is a UUID; collisions between projects are astronomically unlikely.
2. Path depth — the project ID segment added ~40 chars, risking deep-path issues on Windows (NTFS 260-char limit). The recent `chunk-embedding-path-layout` decision fixed filename length (slug to xxh128), but directory nesting was a separate concern.
3. Consistency — the project-vault case never had the segment; only the main-vault fallback did. Now both are uniform.

## Breaking change

Existing embeddings at the old `doc-source/{projectId}/{attachmentId}/` path are orphaned. Users run `sync` to re-index at the new flat path. Old directories are gitignored and re-computable, so no data loss — just a one-time re-embed.

## What changed (commit d5d7aa9, branch flatten-doc-source-path, v0.42.1)

- `src/document-manifest.ts` — `resolveDocSourceBase` drops `projectId` param
- `src/tools/sync.ts` — remove `project.id` from main-vault path construction
- `src/tools/recall.ts` — same
- `src/tools/get.ts` — same
- `src/tools/remove-attachment.ts` — remove `project.id` from main-vault cleanup path
- `src/document-sync.ts` — updated comment
- `tests/document-manifest.unit.test.ts` — updated `resolveDocSourceBase` calls
- `tests/document-source.integration.test.ts` — updated fallback path assertion
- `CHANGELOG.md` — 0.42.1 entry
- `package.json` and `package-lock.json` — bumped to 0.42.1

## Verification

- Typecheck clean, lint clean, format clean
- 42 unit + integration tests pass (document-manifest, document-lazy-load, document-source)
- Pack D dogfood: 12/12 green

## Relationship to prior decisions

- Reverses the namespacing choice in `document-source-embeddings-for-global-policy-projects-main-v-ff2954f1` (Decision 1), which added the `projectId` segment.
- Consistent with `chunk-embedding-path-layout-drop-redundant-guid-prefix-lower-6b739d42` which stripped redundant prefixes from filenames.
- Consistent with `document-source-chunk-embeddings-use-xxh128-for-filenames-an-e3e988b8` which bounded filenames to 32 hex chars.
