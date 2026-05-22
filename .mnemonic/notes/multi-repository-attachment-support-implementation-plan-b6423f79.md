---
title: Multi-repository attachment support — implementation plan
tags:
  - workflow
  - plan
lifecycle: temporary
createdAt: '2026-05-22T19:04:08.973Z'
updatedAt: '2026-05-22T19:16:47.636Z'
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

Federated read-only project attachments: link external repositories as knowledge sources. Attached repo notes participate in recall, summaries, list, get, memory\_graph, and relationship previews. No writes, no auto-discovery, explicit add/remove tools. Explicit attachment sync included in Phase 1.

## Design decisions (confirmed)

- **Discriminated `provenance` field on Vault** instead of `isProject` boolean. Prevents impossible states.
- **Embeddings in consuming project's cache** at `.mnemonic/attachments/<slug>/embeddings/`. Local, disposable, no cross-repo sync.
- **Label format: `attached:<project-slug>/.mnemonic`**. Consistent with `sub-vault:<folder>`.
- **Max 5 attachments per project**, configurable.
- **Read-only Phase 1** (except explicit sync). No writes to external repos. Consolidate and prune never touch attached vaults.
- **Explicit sync for attachments** included — too impactful to defer. No auto-sync on branch change.
- **Branch model: default reads from `main` via git ref**, configurable per-attachment. Working-tree mode as escape hatch.
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
  branch: string; // branch to read from via git; empty = working-tree mode
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
  branch: string; // default "main" — branch to read from via git show/ls-tree
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

Excludes attached vaults. Used by mutation paths (consolidate, prune, remember, update, move\_memory, forget, relate/unrelate).

## Storage layer: attached vault reads via git ref

Unlike project-local vaults (which read from filesystem), attached vault notes are read from a git branch ref to decouple from the working tree state.

- `listNoteIds`: `git ls-tree --name-only <branch> .mnemonic/notes/` to enumerate .md files
- `readNote`: `git show <branch>:<relpath>` to read individual note content
- Embeddings: stored locally in consuming project's `.mnemonic/attachments/<slug>/embeddings/` (filesystem, not git)
- Working-tree fallback (`branch: ""`): reads from filesystem using existing Storage paths
- Sync: `git fetch` in the attached repo to update branch refs
- The attached repo's working tree is never touched — the user can have any branch checked out

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

`collectVisibleNotes` deduplicates by noteId with first-wins. Project-local vaults first in search order, so attached notes only surface on unique ids. Correct for Phase 1. Future: composite key (vault-source + noteId) with shadowedCount metadata.

## Mutating tools: explicit exclusion

Consolidate, prune, remember, update, move\_memory, forget, and relate/unrelate use `searchOrderMutable` or pass `includeAttached: false` to `collectVisibleNotes`. Attached vaults are invisible to all write paths.

## Sync and branch-change handling

Explicit attachment sync is included in Phase 1.

- `sync` tool adds third vault type: `vault: "attached"` for each enabled attachment with path and remote
- `SyncResultSchema.vault` enum becomes `"main" | "project" | "attached"` with `projectSlug` field
- `ensureBranchSynced` does NOT auto-sync attached vaults (cold-path I/O violation)
- Each attached vault sync is independent; failure in one doesn't block others
- Sync for attached vaults: `git fetch` to update branch ref, re-embed changed notes
- No checkout needed — notes are read from branch ref via git, not working tree

### Branch model

- Default branch: `main` (auto-detected on `add_attachment`; falls back to `master` if `main` doesn't exist)
- Configurable per-attachment via `branch` field
- Empty string = working-tree mode (reads from filesystem instead of git ref)
- No runtime branch detection, no mismatch warnings, no cold-path I/O
- `list_attachments` shows configured branch — simple display

## Performance constraints compliance

- **No new I/O on cold paths**: session cache warms lazily (same pattern as existing same-repo vaults). First read per session is cold; subsequent reads cached. No additional I/O when no attachments configured.
- **Fail-soft to undefined**: missing attached repo → debug-log, skip. Git command failure → skip that vault's notes, continue with others. Failed embedding read → undefined (skip note).
- **Session cache reuse**: attached vaults use same `getOrBuildVaultNoteList`/`getOrBuildVaultEmbeddings` cache path. Cache keyed by `vault.storage.vaultPath`.
- **Derive from in-memory data**: config cached on first `loadAttachmentsForProject` per session.
- **Explicit enablement**: `enabled` field; only enabled attachments participate.
- **Bounded counts**: `maxAttachmentsPerProject` config field (default 5). Cap enforced in `addAttachmentConfig`.

- Attachments resolved only with configured project; zero extra I/O without attachments
- Missing attached repo → debug-log, skip, no error
- Session cache reuse via per-vault `getOrBuildVaultNoteList`/`getOrBuildVaultEmbeddings`
- Config cached on first load; no re-read per request
- `maxAttachmentsPerProject` hard cap

## Implementation order

- \[ ] 1. Types: `VaultProvenance`, `AttachmentRef`, `ProjectAttachmentConfig`
- \[ ] 2. Convert `Vault.isProject` → `Vault.provenance` across all call sites
- \[ ] 3. Config: extend `MnemonicConfig` with `projectAttachments`, `maxAttachmentsPerProject`
- \[ ] 4. Config normalization: `normalizeProjectAttachments()` in config.ts
- \[ ] 5. Config schema migration: bump `schemaVersion` to "1.2"
- \[ ] 6. VaultManager: `attachedVaults`, `loadAttachmentsForProject`, CRUD helpers
- \[ ] 7. VaultManager.searchOrder: add attachments segment
- \[ ] 8. VaultManager.searchOrderMutable: new method excluding attachments
- \[ ] 9. VaultManager.allKnownVaults: include attachments
- \[ ] 10. Storage: add git-ref-based reading for attached vaults (StorageAttached variant or mode)
- \[ ] 11. storageLabel: add `attached:<slug>/<folder>` case
- \[ ] 12. \_VaultLabel regex: accept `attached:*` pattern
- \[ ] 13. Embeddings path: `attachments/<slug>/embeddings/` in consuming project root
- \[ ] 14. New tools: `add_attachment`, `remove_attachment`, `list_attachments`, `set_attachment_enabled`, `set_attachment_branch`
- \[ ] 15. Tool descriptions + schema `.describe()` for new output fields
- \[ ] 16. collectVisibleNotes: `includeAttached` param (default true for reads, false for mutations)
- \[ ] 17. recall, project\_memory\_summary, list, get, memory\_graph, recent\_memories: verify
- \[ ] 18. findNote: verify attached vaults searched via searchOrder
- \[ ] 19. Consolidate/prune: verify no attached vault notes touched
- \[ ] 20. Sync: add `vault: "attached"` with git fetch-based sync
- \[ ] 21. ensureBranchSynced: skip attached vaults
- \[ ] 22. Update AGENT.md, README.md, CHANGELOG.md

## Test plan

- \[ ] config.unit.test.ts: attachment config parsing, normalization, count validation, max cap
- \[ ] vault.unit.test.ts: VaultProvenance discrimination, attachment vault creation, search order
- \[ ] storageLabel + \_VaultLabel unit tests: `attached:<slug>/.mnemonic` format
- \[ ] tool-output-schemas.unit.test.ts: \_VaultLabel regex accepts new pattern
- \[ ] storage.unit.test.ts: git-ref-based note reading for attached vaults
- \[ ] attached-vault.integration.test.ts:
  - Add/remove/list attachment lifecycle
  - Default branch auto-detection (main/master fallback)
  - recall returns notes from attached repo
  - project\_memory\_summary includes attached notes in themes
  - list shows `attached:<slug>/.mnemonic` label with branch info
  - get resolves note from attached vault
  - sync explicitly syncs attached vaults via git fetch
  - fail-soft when attached path doesn't exist
  - dedup: project-local note wins over same-id attached note
  - max attachment count enforcement
  - embeddings written to consuming project's attachment embeddings dir
  - consolidate/prune never touch attached vault notes
  - working-tree mode (branch: "") reads from filesystem
  - set\_attachment\_branch changes branch and notes update accordingly
- \[ ] recall-pipeline.integration.test.ts: attached vault notes score/rank correctly
- \[ ] Existing tests: no regressions from isProject → provenance migration

## New MCP tools

### add\_attachment

- Input: `cwd`, `localPath`, `projectSlug?` (auto-detect from remote if omitted), `branch?` (auto-detect main/master if omitted)
- Validates: path exists, contains `.mnemonic/notes/`, not same repo, count < max, branch exists in attached repo
- Auto-detects default branch: `main` → `master` fallback
- Returns: attachment config + vault label

### remove\_attachment

- Input: `cwd`, `projectSlug`
- Removes from config, cleans up `attachments/<slug>/embeddings/`
- Returns: confirmation

### list\_attachments

- Input: `cwd`
- Returns: all attachment configs with status (enabled, path-exists, note count, branch)

### set\_attachment\_enabled

- Input: `cwd`, `projectSlug`, `enabled: boolean`
- Toggles without removing config

### set\_attachment\_branch

- Input: `cwd`, `projectSlug`, `branch: string`
- Changes the branch to read from (empty string = working-tree mode)
- Validates branch exists in attached repo (unless empty string)

## Open decisions (deferred)

- Phase 2: Write support for attached repos (remember, update) — needs separate design pass
- Phase 3: External sub-vault support (vaultFolder != ".mnemonic" in attached repos)
- Composite dedup key (vault-source + noteId)
- Cross-repo relationship behavior (shared relationship targets across repos)
- Auto-sync on branch change for attached vaults (investigate after Phase 1)
