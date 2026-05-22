---
title: Multi-repository attachment plan — critical review
tags:
  - workflow
  - review
  - attachments
  - architecture
lifecycle: temporary
createdAt: '2026-05-22T19:25:44.922Z'
updatedAt: '2026-05-22T19:25:44.922Z'
role: review
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
# Multi-repository attachment plan — critical review

Review of `multi-repository-attachment-support-implementation-plan-b6423f79` against codebase reality. Found **5 Critical, 8 High, 6 Medium** issues.

## P0: Critical (blocks ship)

### C1: `scope: "project"` excludes ALL attached notes

`collectVisibleNotes` (helpers/vault.ts:44-46) filters by `note.project === project.id`. Attached notes retain their original project ID, so `scope: "project"` (the most common scope) renders the feature invisible. Recall, list, recent_memories all filter them out.
**Fix**: Either assign a synthetic project-ID override or add an `isAttachment` flag so scope-logic treats attachments as project-extended.

### C2: `findNote` + `searchOrder` enables writes to read-only attached vaults

All mutation tools (`forget`, `update`, `relate`, `unrelate`, `move_memory`, `consolidate`) use `findNote` which calls `searchOrder(cwd)`. If `searchOrder` includes attached vaults, these tools find and modify notes in read-only repos. The plan's `searchOrderMutable` approach is correct but `findNote` needs a routing parameter.
**Fix**: Add `mutable?: boolean` param to `findNote` (or separate `findNoteMutable`) that uses `searchOrderMutable`.

### C3: `removeRelationshipsToNoteIds` iterates ALL vaults including attached

`helpers/vault.ts:212-236` iterates `allKnownVaults()` and writes to every vault. With attached vaults included, this would **write to read-only repos**.
**Fix**: Must use `allKnownVaultsMutable()` (excluding attached) or skip `provenance === "project-attached"` vaults.

### C4: `writeEmbedding`/`writeProjection` throwing breaks read paths

The plan says "write methods throw (read-only)". But `embedMissingNotes` calls `storage.writeEmbedding()` and `getOrBuildProjection` calls `storage.writeProjection()`. If these throw for attached vaults, embedding pipelines fail silently (caught but skipped), making semantic search non-functional for attached notes.
**Fix**: `writeEmbedding` and `writeProjection` must write to the **local cache** directory (`.mnemonic/attachments/<slug>/`), not throw. Only `writeNote`, `deleteNote`, and atomic write methods should throw.

### C5: No session cache invalidation after sync

After `mnemonic_sync`, the session cache holds stale note lists and embeddings for attached vaults. Mutations invalidate the cache, but sync does not. Users will see outdated content until session restart.
**Fix**: After sync, call `invalidateActiveProjectCache()` (or a targeted variant for attached vault caches only).

## P1: High (functional bugs / significant gaps)

### H1: `vaultMatchesStorageScope` includes attached vaults in `"project-vault"`

Current `vault.isProject` boolean covers both local and attached vaults. With `VaultProvenance`, the `"project-vault"` scope check must be `provenance === "project-local"`, NOT `provenance !== "main"`.

### H2: Note ID collisions across repos — silent data loss

`collectVisibleNotes` deduplicates by `note.id` (line 70). Note IDs are slug-derived — `architecture-decisions` is common. First-wins dedup silently drops attached notes.
**Fix**: Change dedup key to `noteId + vaultPath` or display both with vault disambiguation.

### H3: `isProject` → `VaultProvenance` migration misses dual semantics

`isProject` means both "provenance category" AND "is writable" at different call sites. The plan must add a computed `writable` property. Call sites needing write-ability (pushAfterMutation, protected branch, consolidate) need `!writable` not just `provenance !== "global"`.

### H4: `git show` spawns N subprocesses per recall

Each note read in an attached vault calls `git show <branch>:path`. A 50-candidate recall spawns 50 subprocesses (~250ms-5s). Graph spreading adds discovered candidates beyond session cache.
**Fix**: Batch git reads or pre-populate session cache via `git ls-tree` + bulk read.

### H5: Mutation tools return confusing "not found" for attached notes

If an agent does `list` → sees note `abc123` → `update id="abc123"` → gets "No memory found" because `searchOrderMutable` excludes it.
**Fix**: Two-step lookup — check full `searchOrder` first, then if found in attached vault, return specific error.

### H6: `localPath` in config is machine-specific

Storing absolute paths in `config.json` means configs are not portable across machines.
**Fix**: Consider relative paths or a separate machine-local mapping.

### H7: Stale embeddings after branch update

No mechanism to detect when the attached branch has moved. After `git fetch`, local embeddings don't match current note content.
**Fix**: Store branch tip commit hash alongside embeddings. Compare stored vs. current tip on cache build.

### H8: `pushAfterMutation` must skip attached vaults

`helpers/persistence.ts:212` uses `vault.isProject` to decide push behavior. Must skip `provenance === "project-attached"`.

## P2: Medium (design gaps / edge cases)

- **M1**: No `storedIn` filter for attached-only — add `"attached"` enum or document Phase 1 limitation
- **M2**: `ProjectSummaryNotesSchema` missing `attachedVault` count — `total ≠ projectVault + mainVault + privateProject` breaks
- **M3**: `where_is_memory`, `detect_project`, `discover_tags` not updated for attachment awareness
- **M4**: `maxAttachmentsPerProject` not settable via policy tools
- **M5**: Working-tree mode security risk — uncommitted content with no audit trail
- **M6**: Attached repo with no git remote produces unstable identity
- **M7**: Branch auto-detection only checks `origin/main`/`origin/master` — misses custom defaults
- **M8**: Config writes not concurrency-safe (last-writer-wins)
- **M9**: Shallow clones and `git show` — document as known limitation
- **M10**: `SyncResultSchema.vault` needs `"attached"` variant with projectSlug/branch fields

## Test plan gaps

- No tests for `where_is_memory` with attached vault notes
- No tests for `discover_tags` with attached vaults
- No mutation error-message tests (attached note ID → `update`/`forget`/`relate`)
- No output-rendering tests for `attached:<slug>/.mnemonic` vault labels
- No unit tests for `collectVisibleNotes` with `includeAttached` parameter
- No unit tests for `projectScopeBoost` exclusion of attached vault notes
- No first-recall latency characterization for attached vault cold start
- No test for stale-embedding detection after branch update
