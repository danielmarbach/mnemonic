---
title: Multi-repository attachment plan — critical review
tags:
  - workflow
  - review
  - attachments
  - architecture
lifecycle: temporary
createdAt: '2026-05-22T19:25:44.922Z'
updatedAt: '2026-05-22T19:57:05.220Z'
role: review
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: multi-repository-attachment-support-implementation-plan-b6423f79
    type: derives-from
memoryVersion: 1
---
# Multi-repository attachment plan — critical review

Review of `multi-repository-attachment-support-implementation-plan-b6423f79` against codebase reality. Found **5 Critical, 8 High, 10+ Medium** issues.

**STATUS**: All issues addressed in the updated plan (2026-05-22 revision).

## P0: Critical (blocks ship) — RESOLVED

### C1: `scope: "project"` excludes ALL attached notes — RESOLVED

`collectVisibleNotes` filters by `note.project === project.id`. Plan now uses attachment-extended scope semantics: attached notes pass `scope: "project"` because they are explicitly attached.

### C2: `findNote` + `searchOrder` enables writes to read-only vaults — RESOLVED

`findNote` gains `mutable?: boolean` parameter. Mutation tools pass `mutable: true` which uses `searchOrderMutable`. Two-step lookup produces specific error for attached note IDs.

### C3: `removeRelationshipsToNoteIds` writes to ALL vaults — RESOLVED

Uses `allKnownVaultsMutable()` which excludes attached vaults.

### C4: `writeEmbedding`/`writeProjection` throwing breaks read paths — RESOLVED

`writeEmbedding` and `writeProjection` write to local cache directory. Only `writeNote`, `deleteNote`, and atomic write methods throw.

### C5: No session cache invalidation after sync — RESOLVED

Sync calls `invalidateActiveProjectCache()` or targeted `invalidateAttachedVaultCaches()`.

## P1: High (functional bugs) — RESOLVED

- H1: `provenance === "project-local"` for `project-vault` scope — RESOLVED
- H2: Composite dedup `(noteId, vaultPath)` — RESOLVED
- H3: `writable` computed property replaces `isProject` dual semantics — RESOLVED
- H4: Session-scoped note cache + batch git reads — RESOLVED
- H5: Two-step lookup with specific error message — RESOLVED
- H6: Documented as known limitation (machine-specific `localPath`) — RESOLVED
- H7: `branchTipHash` staleness detection — RESOLVED
- H8: `pushAfterMutation` skips `vault.writable === false` — RESOLVED

## P2: Medium (design gaps) — RESOLVED

- M1: `storedIn: "attached"` enum value added — RESOLVED
- M2: `ProjectSummaryNotesSchema.attachedVault` field added — RESOLVED
- M3: `where_is_memory`, `detect_project`, `discover_tags` updated — RESOLVED
- M4: `maxAttachmentsPerProject` exposed via policy tools — RESOLVED
- M5: Working-tree mode warning — RESOLVED
- M6: Require `origin` remote on attached repos — RESOLVED
- M7: `git symbolic-ref` for branch detection — RESOLVED
- M8: Config concurrency documented as known limitation — RESOLVED
- M9: Shallow clones documented as known limitation — RESOLVED
- M10: `SyncResultSchema` updated with `"attached"` variant — RESOLVED

## Test plan gaps — RESOLVED

All gaps addressed in the updated plan: `where_is_memory` tests, `discover_tags` tests, mutation error-message tests, output-rendering tests, `collectVisibleNotes` with `includeAttached`, attachment boost unit tests, stale-embedding detection tests.
