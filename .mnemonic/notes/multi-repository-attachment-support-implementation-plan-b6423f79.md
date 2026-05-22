---
title: Multi-repository attachment support — implementation plan
tags:
  - workflow
  - plan
lifecycle: temporary
createdAt: '2026-05-22T19:04:08.973Z'
updatedAt: '2026-05-22T19:18:24.818Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: multi-repo-federated-reads-codebase-research-626b102b
    type: derives-from
memoryVersion: 1
---
# Multi-repository attachment support — implementation plan

## Summary

Federated read-only project attachments: link external repositories as knowledge sources. Attached repo notes participate in recall, summaries, list, get, memory_graph, and relationship previews. No writes, no auto-discovery, explicit add/remove tools. Explicit attachment sync included in Phase 1 (justified below).

## Design decisions (confirmed)

- **Discriminated `provenance` field on Vault** instead of `isProject` boolean. Prevents impossible states.
- **Embeddings in consuming project's cache** at `.mnemonic/attachments/<slug>/embeddings/`. Local, disposable, no cross-repo sync. Explicitly gitignored.
- **Label format: `attached:<project-slug>/.mnemonic`**. Consistent with `sub-vault:<folder>`.
- **Max 5 attachments per project**, configurable via `maxAttachmentsPerProject` config field (default 5).
- **Read-only Phase 1** (except explicit sync). No writes to external repos. Consolidate and prune never touch attached vaults.
- **Explicit sync for attachments included in Phase 1**. Justification: without sync, attached repos become stale and agents make decisions on outdated knowledge. Sync is the minimum viable mechanism to refresh attached knowledge. Scope: explicit tool call only, no auto-sync on branch change. The original request root's Phase 2 "sync support" is partially pulled forward; request root has been updated to reflect this.
- **Branch model**: default reads from a configured branch via git ref, configurable per-attachment. Working-tree mode as escape hatch.
- **Fail-soft**: when attached repo not checked out, branch doesn't exist, or git commands fail — debug-log, skip that vault's notes, continue with others.
- **Embeddings built lazily** on first recall, consistent with existing same-repo vault behavior.
- **`storedIn: "project-vault"` matches only project-local vaults**. Attached vaults visible only with `storedIn: "any"`. No new enum value needed for Phase 1.

## Type design

### VaultProvenance — discriminated type

```typescript
type VaultProvenance = "main" | "project-local" | "project-attached";
```

Replaces `isProject: boolean`. Vault interface:

```typescript
interface Vault {
  storage: Storage;
  git: GitOps;
  notesRelDir: string;
  provenance: VaultProvenance;
  vaultFolderName: string;
  attachmentRef?: AttachmentRef; // only present when provenance === "project-attached"
}
```

### AttachmentRef

```typescript
interface AttachmentRef {
  projectSlug: string;   // from attached repo's git remote URL, normalized
  projectName: string;   // human-readable name from attached repo's remote
  localPath: string;     // absolute path to attached repo's git root
  branch: string;        // branch to read from via git; empty = working-tree mode
}
```

### ProjectAttachmentConfig — config shape

```typescript
interface ProjectAttachmentConfig {
  projectSlug: string;   // stable identifier from attached repo's remote URL
  projectName: string;   // human-readable display name
  localPath: string;     // absolute path on this machine
  vaultFolder: string;   // default ".mnemonic"
  enabled: boolean;
  branch: string;        // default "main" — auto-detected on add
  addedAt: string;
  updatedAt: string;
}
```

### Config extension

```typescript
interface MnemonicConfig {
  // ... existing fields ...
  projectAttachments: Record<string, ProjectAttachmentConfig[]>;
  maxAttachmentsPerProject: number; // default 5
}
```

## VaultManager changes

### New data structures

- `attachedVaults: Map<string, Vault[]>` — keyed by consuming project slug. Session-scoped: loaded once per project slug per session.
- `attachmentConfigs: Map<string, ProjectAttachmentConfig[]>` — keyed by consuming project slug

### New methods

- `loadAttachmentsForProject(projectSlug: string): Promise<void>` — resolves enabled attachments from config. For each: validates path exists (fail-soft skip), creates Vault with `provenance: "project-attached"` and `AttachedStorage`. Caches result.
- `getAttachmentsConfig(projectSlug)` — reads from config
- `addAttachmentConfig(projectSlug, config)` — validates count <= max, writes config, reloads
- `removeAttachmentConfig(projectSlug, targetSlug)` — removes by attached slug, cleans up embeddings dir
- `setAttachmentEnabled(projectSlug, targetSlug, enabled)` — toggles
- `setAttachmentBranch(projectSlug, targetSlug, branch)` — updates branch, invalidates cached vault

### Modified searchOrder(cwd)

Resolution chain:

1. `findGitRoot(cwd)` → git root
2. `loadAllVaultsForRoot(gitRoot, false)` → project-local vaults (existing)
3. `detectProject(cwd)` → project identity
4. `loadAttachmentsForProject(projectId)` → cached after first call
5. Append main vault

If step 3 fails (no git repo, no remote), skip step 4. If step 4 finds a missing path, skip silently.

Search order: primary project vault → same-repo sub-vaults → enabled attached vaults → main vault.

### searchOrderMutable(cwd) — new method

Excludes attached vaults. Used by mutation paths: consolidate, prune, remember, update, move_memory, forget, relate, unrelate.

### allKnownVaultsMutable() — new method

Excludes `provenance === "project-attached"` vaults. Used by `forget` (relationship cleanup across all vaults), `relate`/`unrelate` (note modification across all vaults). Prevents cross-vault mutations on attached notes.

### Modified allKnownVaults()

Includes attached vaults. Used only in read paths: `getRelationshipPreview`, `project_memory_summary` orientation enrichment.

## Storage layer: AttachedStorage class

A wrapper around `Storage` that overrides `listNoteIds()` and `readNote()` with git-ref reads. All other methods (embeddings, projections) delegate to the base filesystem `Storage` at the consuming project's attachment path. Write methods throw (read-only).

```typescript
class AttachedStorage {
  private baseStorage: Storage;   // at consuming project's attachment embeddings path
  private repoPath: string;       // attached repo's git root
  private branch: string;         // configured branch (or "" for working-tree)

  async listNoteIds(): Promise<MemoryId[]> {
    if (this.branch === "") return this.baseStorage.listNoteIds();
    // git ls-tree --name-only <branch> .mnemonic/notes/
    // fail-soft: return [] on error
  }

  async readNote(id: MemoryId): Promise<Note | null> {
    if (this.branch === "") return this.baseStorage.readNote(id);
    // git show <branch>:.mnemonic/notes/<id>.md
    // fail-soft: return null on error
  }

  // listNotes, writeNote, deleteNote, readEmbedding, writeEmbedding, readProjection,
  // writeProjection, init, beginAtomicNotesWrite, commitAtomicNotesWrite → delegate to baseStorage
}
```

**Vault creation** in `loadAttachmentsForProject`:

- Base Storage: `new Storage(attachmentsEmbeddingsDir)` where `attachmentsEmbeddingsDir = <project-root>/.mnemonic/attachments/<slug>/`
- GitOps: `new GitOps(repoPath, ".mnemonic/notes")`
- `notesRelDir: ".mnemonic/notes"`
- `provenance: "project-attached"`
- `attachmentRef`: populated with slug (from remote), name (from remote), localPath, branch

## Session cache integration

Attached vaults participate in `getOrBuildVaultNoteList(projectId, vault)` and `getOrBuildVaultEmbeddings(projectId, vault)` exactly like same-repo vaults. Cache keyed by `vault.storage.vaultPath` (the consuming project's attachment path). First read per session warms the cache; subsequent reads are cached. Same I/O pattern as existing vaults — no new cold-path violation. Cache invalidation via `invalidateActiveProjectCache()` clears attached vault caches alongside all others.

## storageLabel update

```typescript
function storageLabel(vault: Vault): string {
  if (vault.provenance === "main") return "main-vault";
  if (vault.provenance === "project-local") {
    if (vault.vaultFolderName === ".mnemonic") return "project-vault";
    return `sub-vault:${vault.vaultFolderName}`;
  }
  return `attached:${vault.attachmentRef!.projectSlug}/${vault.vaultFolderName}`;
}
```

## _VaultLabel schema update

```typescript
const _VaultLabel = z.string().regex(
  /^main-vault$|^project-vault$|^sub-vault:\.mnemonic-.+$|^attached:[a-z0-9][-a-z0-9]*\/\.mnemonic(-.+)?$/
);
```

All output schemas referencing `_VaultLabel` (RecallResultSchema, ListResultSchema, GetResultSchema, WhereIsResultSchema, RecentResultSchema, MoveResultSchema, retry schema) automatically accept the new pattern after this single regex update. Each schema field description updates to mention the new format.

## vaultMatchesStorageScope update

```typescript
function vaultMatchesStorageScope(vault: Vault, storedIn: StorageScope): boolean {
  if (storedIn === "any") return true;
  if (storedIn === "main-vault") return vault.provenance === "main";
  // "project-vault" matches only project-local vaults (not attached)
  return vault.provenance === "project-local";
}
```

Attached vault notes are only visible with `storedIn: "any"`. No new enum value needed. `list_attachments` is the dedicated tool for attachment enumeration.

## Note.project field and filtering

Attached notes retain their original `Note.project` value (the attached repo's project ID).

- `scope: "project"` → attached notes excluded (different project ID)
- `scope: "all"` → attached notes appear with own project ref and `attached:<slug>/.mnemonic` vault label
- `scope: "global"` → attached notes excluded (they have a project field)
- `project_memory_summary` uses `scope: "all"` → attached notes appear in themes and orientation

## Recall boost behavior

- `projectScopeBoost` applies only to notes with `note.project === currentProjectId`. Attached repo notes have different project IDs → no boost. They compete on semantic similarity alone with global notes for ranking.

## Embeddings path and gitignore

Attached vault Storage gets `embeddingsDirOverride` pointing to `.mnemonic/attachments/<attached-slug>/embeddings/` under consuming project root. Add `attachments/` to `.mnemonic/.gitignore` (alongside existing `embeddings/` and `projections/` entries) during vault initialization.

## Dedup strategy (Phase 1)

`collectVisibleNotes` deduplicates by noteId with first-wins. Project-local vaults first in search order, so attached notes only surface on unique ids. Correct for Phase 1.

## Mutating tools: explicit exclusion

All mutation tools (`remember`, `update`, `forget`, `move_memory`, `consolidate`, `relate`, `unrelate`) use `searchOrderMutable` and `allKnownVaultsMutable`. Attached vaults are completely invisible. If a user passes an attached vault note ID to `update`/`forget`, `findNote` fails to find it and returns an appropriate error — no special handling needed beyond the existing "not found" code path.

## Sync and branch-change handling

Explicit attachment sync is included in Phase 1.

- `sync` tool adds third vault type: `vault: "attached"` for each enabled attachment with path and remote
- `SyncResultSchema.vault` enum becomes `"main" | "project" | "attached"` with `projectSlug` and `branch` fields
- `ensureBranchSynced` does NOT auto-sync attached vaults (cold-path I/O)
- Each attached vault sync is independent; failure in one doesn't block others
- Sync for attached vaults: `git fetch` to update branch ref, then reconcile embeddings (remove deleted, embed new/changed)
- No checkout needed — notes are read from branch ref via git

### Branch model

- Default branch: `main`. Auto-detected on `add_attachment` via `git branch -r --list origin/main`; falls back to `origin/master` if not found.
- Configurable per-attachment via `branch` field
- Empty string = working-tree mode (reads from filesystem via base Storage)
- No runtime branch detection, no mismatch warnings, no cold-path I/O
- `list_attachments` shows configured branch — display only

## Performance constraints compliance

- **No new I/O on cold paths**: session cache warms lazily (same pattern as existing same-repo vaults). First read per session is cold; subsequent reads cached. No additional I/O when no attachments configured.
- **Fail-soft**: missing attached repo → debug-log, skip. Git command failure → skip that vault's notes, continue. Failed embedding read → undefined (skip note).
- **Session cache reuse**: attached vaults use same `getOrBuildVaultNoteList`/`getOrBuildVaultEmbeddings` path. Cache keyed by `vault.storage.vaultPath`.
- **Derive from in-memory data**: config cached on first `loadAttachmentsForProject` per session.
- **Explicit enablement**: `enabled` field; only enabled attachments participate.
- **Bounded counts**: `maxAttachmentsPerProject` config field (default 5). Cap enforced in `addAttachmentConfig`.

## Implementation order

### Phase 1a: Type migration

- [ ] 1. Define `VaultProvenance`, `AttachmentRef`, `ProjectAttachmentConfig` types
- [ ] 2. Convert `Vault.isProject` → `Vault.provenance` across all call sites:
  - `storageLabel` — `vault.isProject` → `vault.provenance === "project-local"`
  - `vaultMatchesStorageScope` — `vault.isProject` → `vault.provenance === "project-local"`
  - `vault.ts` `makeVault` — add `provenance` parameter
  - `vault.ts` `loadAllVaultsForRoot` — set `provenance: "project-local"` on sub-vaults
  - All tests referencing `.isProject`
- [ ] 3. Run full test suite to confirm no regressions

### Phase 1b: Config + VaultManager

- [ ] 4. Config: extend `MnemonicConfig` with `projectAttachments`, `maxAttachmentsPerProject`
- [ ] 5. Config normalization: `normalizeProjectAttachments()` in config.ts
- [ ] 6. Config schema migration: bump `schemaVersion` to "1.2"
- [ ] 7. VaultManager: `attachedVaults` map, `attachmentConfigs` map
- [ ] 8. VaultManager: `loadAttachmentsForProject`, `getAttachmentsConfig`, `addAttachmentConfig`, `removeAttachmentConfig`, `setAttachmentEnabled`, `setAttachmentBranch`

### Phase 1c: Storage layer

- [ ] 9. `AttachedStorage` class wrapping `Storage` with git-ref `listNoteIds`/`readNote` overrides
- [ ] 10. Git command helpers for `git ls-tree` and `git show` with fail-soft error handling
- [ ] 11. Embeddings path: `attachments/<slug>/embeddings/` in consuming project root
- [ ] 12. Gitignore: add `attachments/` to `.mnemonic/.gitignore`

### Phase 1d: Vault routing

- [ ] 13. `searchOrder`: add attachment resolution (git root → project identity → attachment configs → attached vaults)
- [ ] 14. `searchOrderMutable`: new method excluding `project-attached` vaults
- [ ] 15. `allKnownVaultsMutable`: new method excluding `project-attached` vaults
- [ ] 16. Update mutation callers: `forget` → `allKnownVaultsMutable`, `relate`/`unrelate` → `allKnownVaultsMutable`
- [ ] 17. Update mutation callers: all write tools → `searchOrderMutable`
- [ ] 18. `storageLabel`: add `attached:<slug>/<folder>` case
- [ ] 19. `vaultMatchesStorageScope`: `provenance === "project-local"` for `project-vault` filter
- [ ] 20. `_VaultLabel` regex: accept `attached:*` pattern
- [ ] 21. All output schema `.describe()` updates for new vault label pattern

### Phase 1e: Tools

- [ ] 22. New tools: `add_attachment`, `remove_attachment`, `list_attachments`, `set_attachment_enabled`, `set_attachment_branch`
- [ ] 23. Tool description Returns sections: bullets for all new output fields
- [ ] 24. Sync tool: add `vault: "attached"` with `projectSlug`, `branch` fields; git fetch + embed reconciliation
- [ ] 25. `ensureBranchSynced`: skip attached vaults (no auto-sync)

### Phase 1f: Read path verification

- [ ] 26. `collectVisibleNotes`: `includeAttached` param (default true for reads, false for mutations)
- [ ] 27. Verify: recall, project_memory_summary, list, get, memory_graph, recent_memories include attached notes
- [ ] 28. Verify: `findNote` via `searchOrder` resolves attached vault notes
- [ ] 29. Verify: consolidate, prune, remember, update, forget, move_memory, relate, unrelate never touch attached vaults
- [ ] 30. Verify: contextual metrics (recallScopeNoteCount, diversity, retrievalCoverage) include attached notes

### Phase 1g: Documentation

- [ ] 31. Update AGENT.md — tool table for 5 new tools + updated sync schema
- [ ] 32. Update README.md — attachment feature documentation
- [ ] 33. Update CHANGELOG.md — curated entry

## Test plan

### Unit tests

- [ ] `config.unit.test.ts`: attachment config parsing, normalization, count validation, max cap, branch validation
- [ ] `vault.unit.test.ts`: VaultProvenance discrimination, attachment vault creation, search order with/without attachments
- [ ] `vault.unit.test.ts`: `allKnownVaults` vs `allKnownVaultsMutable` — attached vaults excluded from mutable
- [ ] `vault.unit.test.ts`: `searchOrder` vs `searchOrderMutable` — attached vaults excluded from mutable
- [ ] `storageLabel` unit tests: all provenance types, `attached:<slug>/.mnemonic` format
- [ ] `vaultMatchesStorageScope` unit tests: `project-vault` filter excludes attached vaults
- [ ] `tool-output-schemas.unit.test.ts`: `_VaultLabel` regex accepts `attached:*` pattern
- [ ] `storage.unit.test.ts`: `AttachedStorage` git-ref reads, working-tree fallback, fail-soft on git errors
- [ ] `recall.unit.test.ts`: `projectScopeBoost` NOT applied to attached vault notes

### Integration tests

- [ ] `attached-vault.integration.test.ts`:
  - `add_attachment` with default branch auto-detection (main/master)
  - `add_attachment` with explicit branch
  - `add_attachment` rejects invalid path, missing notes dir, same repo, count > max
  - `list_attachments` shows enabled status, branch, path-exists, note count
  - `set_attachment_enabled` toggles without removing config
  - `set_attachment_branch` changes branch; notes update accordingly
  - `remove_attachment` removes config, cleans up embeddings dir
  - `recall` returns notes from attached repo with `attached:<slug>/.mnemonic` label
  - `project_memory_summary` includes attached notes in themes when `scope: "all"`
  - `list` shows attached notes with correct vault label
  - `get` resolves note from attached vault
  - `memory_graph` nodes include attached vault provenance
  - `recent_memories` includes attached notes
  - `sync` explicitly syncs attached vaults via `git fetch`
  - `storedIn: "project-vault"` excludes attached notes (only project-local)
  - `storedIn: "any"` includes attached notes
  - Fail-soft when attached path doesn't exist (notes absent)
  - Fail-soft when branch doesn't exist on attached repo
  - Fail-soft when git commands fail (notes absent for that vault)
  - Dedup: project-local note wins over same-id attached note
  - Max attachment count enforcement
  - Embeddings written to consuming project's `.mnemonic/attachments/<slug>/embeddings/`
  - Consolidate never touches attached vault notes
  - Forget never touches attached vault notes (uses `allKnownVaultsMutable`)
  - Relate/unrelate never modify attached vault notes (uses `allKnownVaultsMutable`)
  - Remember/update/move_memory return "not found" for attached note IDs
  - Working-tree mode (`branch: ""`) reads from filesystem

- [ ] `recall-pipeline.integration.test.ts`: attached vault notes score/rank correctly, projectScopeBoost not applied
- [ ] `tool-descriptions.integration.test.ts`: new tool descriptions match schema
- [ ] Existing tests: no regressions from `isProject` → `provenance` migration (full suite)

## New MCP tools

### add_attachment

- Input: `cwd`, `localPath` (absolute), `projectSlug?` (auto-detect from attached repo's remote), `branch?` (auto-detect main/master)
- Behavior:
  - Resolve attached repo's project identity from git remote URL (NOT from local path)
  - Auto-detect branch: check `origin/main`, fall back `origin/master`
  - Validate: path exists, contains `<vaultFolder>/notes/`, not same repo, count < max
  - Write config, reload attachments
- Returns: `{ projectSlug, projectName, localPath, vaultFolder, branch, enabled, noteCount }`

### remove_attachment

- Input: `cwd`, `projectSlug`
- Removes from config, cleans up `.mnemonic/attachments/<slug>/embeddings/`, invalidates cache
- Returns: confirmation

### list_attachments

- Input: `cwd`
- Returns: array of `{ projectSlug, projectName, localPath, vaultFolder, branch, enabled, pathExists, noteCount, addedAt, updatedAt }`

### set_attachment_enabled

- Input: `cwd`, `projectSlug`, `enabled: boolean`
- Toggles without removing config
- Returns: updated config entry

### set_attachment_branch

- Input: `cwd`, `projectSlug`, `branch: string`
- Validates branch exists in attached repo (unless empty string for working-tree)
- Updates config, invalidates cached vault, reloads
- Returns: updated config entry

## Open decisions (deferred)

- Phase 2: Write support for attached repos (remember, update) — needs separate design pass
- Phase 3: External sub-vault support (vaultFolder != ".mnemonic" in attached repos)
- Composite dedup key (vault-source + noteId) for dedup across repos
- Cross-repo relationship behavior (shared relationship targets across repos)
- Auto-sync on branch change for attached vaults (investigate after Phase 1)
