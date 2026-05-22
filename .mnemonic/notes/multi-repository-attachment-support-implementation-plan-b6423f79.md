---
title: Multi-repository attachment support — implementation plan
tags:
  - workflow
  - plan
lifecycle: temporary
createdAt: '2026-05-22T19:04:08.973Z'
updatedAt: '2026-05-22T19:05:29.549Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
# Multi-repository attachment support — implementation plan

## Summary

Federated read-only project attachments: link external repositories as knowledge sources. Attached repo notes participate in recall, summaries, list, get, memory\_graph, and relationship previews. No writes, no auto-discovery, explicit add/remove tools.

## Design decisions (confirmed)

- **Discriminated `provenance` field on Vault** instead of `isProject` boolean. Prevents impossible states.
- **Embeddings in consuming project's cache** at `.mnemonic/attachments/<slug>/embeddings/`. Local, disposable, no cross-repo sync.
- **Label format: `attached:<project-slug>/.mnemonic`**. Consistent with `sub-vault:<folder>`.
- **Max 5 attachments per project**, configurable.
- **Read-only Phase 1**. No writes to external repos. Consolidate and prune never touch attached vaults.
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
  /** Only present when provenance === "project-attached" */
  attachmentRef?: AttachmentRef;
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

## \_VaultLabel schema update

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

`collectVisibleNotes` deduplicates by noteId with first-wins. Project-local vaults first in search order, so attached notes only surface on unique ids. This is correct for Phase 1.

## New MCP tools

### add\_attachment

- Input: `cwd`, `localPath`, `projectSlug?` (auto-detect from remote if omitted)
- Validates: path exists, contains `.mnemonic/notes/`, not same repo, count < max
- Returns: attachment config + vault label

### remove\_attachment

- Input: `cwd`, `projectSlug`
- Removes from config, cleans up `attachments/<slug>/embeddings/`
- Returns: confirmation

### list\_attachments

- Input: `cwd`
- Returns: all attachment configs with status (enabled, path-exists, note count)

### set\_attachment\_enabled

- Input: `cwd`, `projectSlug`, `enabled`
- Toggles without removing config

## Mutating tools: explicit exclusion

Consolidate, prune, remember, update, move\_memory, forget, and relate/unrelate must never operate on attached vaults. These tools use `collectVisibleNotes`, `searchOrder`, and `findNote` for vault enumeration. We add an explicit filter or a separate `searchOrderForReads` (excluding attachments for mutation paths):

- `searchOrder(cwd)` — includes attachments (used by recall, summary, list, get, graph)
- `searchOrderMutable(cwd)` — excludes attachments (used by consolidate, prune, remember, update, move\_memory, forget, relate/unrelate)

Alternatively, make `collectVisibleNotes` accept an `includeAttached: boolean` parameter defaulting to `true` for reads and `false` for mutations.

## Sync and branch-change handling

Explicit attachment sync is included in Phase 1 — it is too impactful to defer. Agents need a way to refresh attached repo knowledge. Scope: explicit sync only, no auto-sync on branch change.

- `sync` tool adds third vault type: `vault: "attached"` for each enabled attachment that has a path and remote
- `SyncResultSchema.vault` enum becomes `"main" | "project" | "attached"` with attached slug in a `projectSlug` field
- `ensureBranchSynced` does NOT auto-sync attached vaults (avoids cold-path I/O)
- Each attached vault sync is independent; failure in one doesn't block others
- Stale attachments are still acceptable for reads — sync is opt-in, not blocking

- Attached vaults never auto-synced in Phase 1
- `sync` tool skips attached vaults
- `ensureBranchSynced` does not enumerate attached vaults

## Performance constraints compliance

- Attachments resolved only when cwd with configured project; zero extra I/O when no attachments
- Missing attached repo → debug-log, skip, no error
- Session cache reuse via `getOrBuildVaultNoteList`/`getOrBuildVaultEmbeddings` per-vault
- Config cached on first load; no re-read per request
- Each attachment has `enabled` field; only enabled ones participate
- `maxAttachmentsPerProject` hard cap

## Implementation order

- \[ ] 1. Types: `VaultProvenance`, `AttachmentRef`, `ProjectAttachmentConfig`
- \[ ] 2. Convert `Vault.isProject` → `Vault.provenance` across all call sites
- \[ ] 3. Config: extend `MnemonicConfig` with `projectAttachments`, `maxAttachmentsPerProject`
- \[ ] 4. Config normalization: `normalizeProjectAttachments()` in config.ts
- \[ ] 5. Config schema migration: bump `schemaVersion` to "1.2"
- \[ ] 6. VaultManager: `attachedVaults`, `loadAttachmentsForProject`, CRUD helpers
- \[ ] 7. VaultManager.searchOrder: add attachments segment
- \[ ] 8. VaultManager.allKnownVaults: include attachments (for relationship expansion)
- \[ ] 9. VaultManager.searchOrderMutable: excludes attachments (for mutation paths)
- \[ ] 10. storageLabel: add `attached:<slug>/<folder>` case
- \[ ] 11. \_VaultLabel regex: accept `attached:*` pattern
- \[ ] 12. Embeddings path: `attachments/<slug>/embeddings/` in consuming project root
- \[ ] 13. New tools: `add_attachment`, `remove_attachment`, `list_attachments`, `set_attachment_enabled`
- \[ ] 14. Tool descriptions + schema `.describe()` for all new output fields
- \[ ] 15. collectVisibleNotes: ensure attached vaults participate in reads but not mutations
- \[ ] 16. recall, project\_memory\_summary, list, get, memory\_graph, recent\_memories: verify attached notes appear
- \[ ] 17. findNote: works via searchOrder — verify attached vaults searched
- \[ ] 18. Consolidate/prune: verify NO attached vault notes touched
- \[ ] 19. Sync: add `vault: "attached"` support for explicit attached vault sync
- \[ ] 20. ensureBranchSynced: explicitly skip attached vaults
- \[ ] 21. Update AGENT.md, README.md, CHANGELOG.md

- \[ ] 1. Types: `VaultProvenance`, `AttachmentRef`, `ProjectAttachmentConfig`
- \[ ] 2. Convert `Vault.isProject` → `Vault.provenance` across all call sites
- \[ ] 3. Config: extend `MnemonicConfig` with `projectAttachments`, `maxAttachmentsPerProject`
- \[ ] 4. Config normalization: `normalizeProjectAttachments()` in config.ts
- \[ ] 5. Config schema migration: bump `schemaVersion` to "1.2"
- \[ ] 6. VaultManager: `attachedVaults`, `loadAttachmentsForProject`, CRUD helpers
- \[ ] 7. VaultManager.searchOrder: add attachments segment
- \[ ] 8. VaultManager.allKnownVaults: include attachments (for relationship expansion)
- \[ ] 9. VaultManager.searchOrderMutable: excludes attachments (for mutation paths)
- \[ ] 10. storageLabel: add `attached:<slug>/<folder>` case
- \[ ] 11. \_VaultLabel regex: accept `attached:*` pattern
- \[ ] 12. Embeddings path: `attachments/<slug>/embeddings/` in consuming project root
- \[ ] 13. New tools: `add_attachment`, `remove_attachment`, `list_attachments`, `set_attachment_enabled`
- \[ ] 14. Tool descriptions + schema `.describe()` for all new output fields
- \[ ] 15. collectVisibleNotes: ensure attached vaults participate in reads but not mutations
- \[ ] 16. recall, project\_memory\_summary, list, get, memory\_graph, recent\_memories: verify attached notes appear
- \[ ] 17. findNote: works via searchOrder — verify attached vaults searched
- \[ ] 18. Consolidate/prune: verify NO attached vault notes touched (use searchOrderMutable / exclude-attached path)
- \[ ] 19. Sync + ensureBranchSynced: skip attached vaults
- \[ ] 20. Update AGENT.md, README.md, CHANGELOG.md

## Test plan

- \[ ] config.unit.test.ts: attachment config parsing, normalization, count validation, max cap
- \[ ] vault.unit.test.ts: VaultProvenance discrimination, attachment vault creation, search order with/without attachments
- \[ ] storageLabel + \_VaultLabel unit tests: `attached:<slug>/.mnemonic` format acceptance
- \[ ] attached-vault.integration.test.ts:
  - Add/remove/list attachment lifecycle
  - recall returns notes from attached repo
  - project\_memory\_summary includes attached notes in themes
  - list shows `attached:<slug>/.mnemonic` label
  - get resolves note from attached vault
  - sync explicitly syncs attached vaults
  - Fail-soft when attached path doesn't exist
  - Dedup: project-local note wins over same-id attached note
  - Max attachment count enforcement
  - Embeddings written to consuming project's attachment embeddings dir
  - Consolidate/prune never touch attached vault notes
  - Branch change does NOT auto-sync attached vaults
- \[ ] recall-pipeline.integration.test.ts: attached vault notes score/rank correctly
- \[ ] Existing tests: no regressions from isProject → provenance migration

## Open decisions (deferred)

- Phase 2: Write support for attached repos (remember, update) — needs separate design pass
- Phase 3: External sub-vault support (vaultFolder != ".mnemonic" in attached repos)
- Composite dedup key (vault-source + noteId)
- Cross-repo relationship behavior (shared relationship targets across repos)
- Auto-sync on branch change for attached vaults (investigate after Phase 1)

- \[ ] config.unit.test.ts: attachment config parsing, normalization, count validation, max cap
- \[ ] vault.unit.test.ts: VaultProvenance discrimination, attachment vault creation, search order with attachments
- \[ ] storageLabel + \_VaultLabel unit tests: `attached:<slug>/.mnemonic` format acceptance
- \[ ] attached-vault.integration.test.ts:
  - Add/remove/list attachment lifecycle
  - recall returns notes from attached repo
  - project\_memory\_summary includes attached notes in themes
  - list shows `attached:<slug>/.mnemonic` label
  - get resolves note from attached vault
  - Fail-soft when attached path doesn't exist
  - Dedup: project-local note wins over same-id attached note
  - Max attachment count enforcement
  - Embeddings written to consuming project's attachment embeddings dir
  - Consolidate/prune never touch attached vault notes
- \[ ] recall-pipeline.integration.test.ts: attached vault notes score/rank correctly
- \[ ] Existing tests: no regressions from isProject → provenance migration
