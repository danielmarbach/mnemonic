---
title: >-
  Chunk embedding path layout: drop redundant guid prefix, lowercase filenames,
  reconcile on schema change
tags:
  - decision
  - attachments
  - document-source
  - embeddings
lifecycle: permanent
createdAt: '2026-08-01T22:39:23.145Z'
updatedAt: '2026-08-01T22:39:23.145Z'
role: decision
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
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
