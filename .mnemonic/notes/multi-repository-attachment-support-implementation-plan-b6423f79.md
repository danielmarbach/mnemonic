---
title: Multi-repository attachment support — implementation plan
tags:
  - workflow
  - plan
lifecycle: temporary
createdAt: '2026-05-22T19:04:08.973Z'
updatedAt: '2026-05-22T19:06:53.775Z'
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

Federated read-only project attachments: link external repositories as knowledge sources. Attached repo notes participate in recall, summaries, list, get, memory_graph, and relationship previews. No writes, no auto-discovery, explicit add/remove tools. Explicit attachment sync included in Phase 1.

## Design decisions (confirmed)

- **Discriminated `provenance` field on Vault** instead of `isProject` boolean. Prevents impossible states.
- **Embeddings in consuming project's cache** at `.mnemonic/attachments/<slug>/embeddings/`. Local, disposable, no cross-repo sync.
- **Label format: `attached:<project-slug>/.mnemonic`**. Consistent with `sub-vault:<folder>`.
- **Max 5 attachments per project**, configurable.
- **Read-only Phase 1** (except explicit sync). No writes to external repos. Consolidate and prune never touch attached vaults.
- **Explicit sync for attachments** included — too impactful to defer. No auto-sync on branch change.
- **Branch tracking**: capture `lastKnownBranch` on attach/sync; surface mismatch warnings in `list_attachments`.
- **Fail-soft when attached repo not checked out**. Debug-log, skip.

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
  projectSlug: string;
  projectName: string;
  localPath: string;
}
```

### ProjectAttachmentConfig — config shape

```typescript
interface ProjectAttachmentConfig {
  projectSlug: string;
  projectName: string;
  localPath: string;
  vaultFolder: string; // default ".mnemonic"
  enabled: boolean;
  lastKnownBranch?: string; // captured on add_attachment, updated on sync
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

- `attachedVaults: Map<string, Vault[]>` — keyed by consuming project slug
- `attachmentConfigs: Map<string, ProjectAttachmentConfig[]>` — keyed by consuming project slug

### New methods

- `loadAttachmentsForProject(projectSlug)` — resolves enabled attachments, creates Vault instances
- `getAttachmentsConfig(projectSlug)` — reads from config
- `addAttachmentConfig(projectSlug, config)` — validates count, writes config, reloads
- `removeAttachmentConfig(projectSlug, targetSlug)` — removes by attached slug
- `setAttachmentEnabled(projectSlug, targetSlug, enabled)` — toggles

### Modified searchOrder(cwd)

```text
primary project vault → same-repo sub-vaults → enabled attached vaults → main vault
```

### Modified allKnownVaults()

Includes attached vaults for relationship expansion and forget.

### searchOrderMutable(cwd) — new method

Excludes attached vaults. Used by mutation paths (consolidate, prune, remember, update, move_memory, forget, relate/unrelate).

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

## Embeddings path

Attached vault Storage gets `embeddingsDirOverride`:
`.mnemonic/attachments/<attached-slug>/embeddings/` under consuming project root.

Gitignored via `.mnemonic/.gitignore`.

## Dedup strategy (Phase 1)

`collectVisibleNotes` deduplicates by noteId with first-wins. Project-local vaults first in search order, so attached notes only surface on unique ids. Correct for Phase 1. Future: composite key (vault-source + noteId) with shadowedCount metadata.

## Mutating tools: explicit exclusion

Consolidate, prune, remember, update, move_memory, forget, and relate/unrelate use `searchOrderMutable` or pass `includeAttached: false` to `collectVisibleNotes`. Attached vaults are invisible to all write paths.

## Sync and branch-change handling

Explicit attachment sync is included in Phase 1.

- `sync` tool adds third vault type: `vault: "attached"` for each enabled attachment with path and remote
- `SyncResultSchema.vault` enum becomes `"main" | "project" | "attached"` with `projectSlug` field
- `ensureBranchSynced` does NOT auto-sync attached vaults (cold-path I/O violation)
- Each attached vault sync is independent; failure in one doesn't block others
- Stale attachments are acceptable for reads — sync is opt-in

### Branch tracking for attached repos

- `ProjectAttachmentConfig.lastKnownBranch` — captured on `add_attachment`, updated on sync
- `list_attachments` output includes `currentBranch` and `lastKnownBranch`
- `list_attachments` shows warning when `currentBranch !== lastKnownBranch`: "Attached repo may have changed branches — notes may differ from last sync. Run sync to reconcile."
- No auto-detection on read paths (recall, summary, etc.)
- Branch change in consuming project triggers auto-sync for main + project vault only

## Performance constraints compliance

- Attachments resolved only with configured project; zero extra I/O without attachments
- Missing attached repo → debug-log, skip, no error
- Session cache reuse via per-vault `getOrBuildVaultNoteList`/`getOrBuildVaultEmbeddings`
- Config cached on first load; no re-read per request
- `maxAttachmentsPerProject` hard cap

## Implementation order

- [ ] 1. Types: `VaultProvenance`, `AttachmentRef`, `ProjectAttachmentConfig`
- [ ] 2. Convert `Vault.isProject` → `Vault.provenance` across all call sites
- [ ] 3. Config: extend `MnemonicConfig` with `projectAttachments`, `maxAttachmentsPerProject`
- [ ] 4. Config normalization: `normalizeProjectAttachments()` in config.ts
- [ ] 5. Config schema migration: bump `schemaVersion` to "1.2"
- [ ] 6. VaultManager: `attachedVaults`, `loadAttachmentsForProject`, CRUD helpers
- [ ] 7. VaultManager.searchOrder: add attachments segment
- [ ] 8. VaultManager.searchOrderMutable: new method excluding attachments
- [ ] 9. VaultManager.allKnownVaults: include attachments
- [ ] 10. storageLabel: add `attached:<slug>/<folder>` case
- [ ] 11. _VaultLabel regex: accept `attached:*` pattern
- [ ] 12. Embeddings path: `attachments/<slug>/embeddings/` in consuming project root
- [ ] 13. New tools: `add_attachment`, `remove_attachment`, `list_attachments`, `set_attachment_enabled`
- [ ] 14. Tool descriptions + schema `.describe()` for new output fields
- [ ] 15. collectVisibleNotes: `includeAttached` param (default true for reads, false for mutations)
- [ ] 16. recall, project_memory_summary, list, get, memory_graph, recent_memories: verify
- [ ] 17. findNote: verify attached vaults searched via searchOrder
- [ ] 18. Consolidate/prune: verify no attached vault notes touched
- [ ] 19. Sync: add `vault: "attached"` with branch tracking
- [ ] 20. ensureBranchSynced: skip attached vaults
- [ ] 21. Update AGENT.md, README.md, CHANGELOG.md

## Test plan

- [ ] config.unit.test.ts: attachment config parsing, normalization, count validation, max cap
- [ ] vault.unit.test.ts: VaultProvenance discrimination, attachment vault creation, search order
- [ ] storageLabel + _VaultLabel unit tests: `attached:<slug>/.mnemonic` format
- [ ] tool-output-schemas.unit.test.ts: _VaultLabel regex accepts new pattern
- [ ] attached-vault.integration.test.ts:
  - Add/remove/list attachment lifecycle
  - recall returns notes from attached repo
  - project_memory_summary includes attached notes in themes
  - list shows `attached:<slug>/.mnemonic` label
  - get resolves note from attached vault
  - sync explicitly syncs attached vaults
  - fail-soft when attached path doesn't exist
  - dedup: project-local note wins over same-id attached note
  - max attachment count enforcement
  - embeddings written to consuming project's attachment embeddings dir
  - consolidate/prune never touch attached vault notes
  - branch change does NOT auto-sync attached vaults
  - list_attachments branch mismatch warning
- [ ] recall-pipeline.integration.test.ts: attached vault notes score/rank correctly
- [ ] Existing tests: no regressions from isProject → provenance migration

## New MCP tools

### add_attachment

- Input: `cwd`, `localPath`, `projectSlug?` (auto-detect from remote if omitted)
- Validates: path exists, contains `.mnemonic/notes/`, not same repo, count < max
- Captures current branch as `lastKnownBranch`
- Returns: attachment config + vault label

### remove_attachment

- Input: `cwd`, `projectSlug`
- Removes from config, cleans up `attachments/<slug>/embeddings/`
- Returns: confirmation

### list_attachments

- Input: `cwd`
- Returns: all attachment configs with status (enabled, path-exists, note count, currentBranch, lastKnownBranch)
- Shows branch mismatch warning when detected

### set_attachment_enabled

- Input: `cwd`, `projectSlug`, `enabled: boolean`
- Toggles without removing config

## Open decisions (deferred)

- Phase 2: Write support for attached repos (remember, update) — needs separate design pass
- Phase 3: External sub-vault support (vaultFolder != ".mnemonic" in attached repos)
- Composite dedup key (vault-source + noteId)
- Cross-repo relationship behavior (shared relationship targets across repos)
- Auto-sync on branch change for attached vaults (investigate after Phase 1)
