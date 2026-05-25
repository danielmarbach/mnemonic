---
title: Multi-repo federated reads — codebase research
tags:
  - workflow
  - research
lifecycle: temporary
createdAt: '2026-05-22T18:44:34.351Z'
updatedAt: '2026-05-22T19:05:37.466Z'
role: research
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
# Multi-repo federated reads — codebase research

## Vault layer: current architecture

### Vault interface (`src/vault.ts:12-29`)

- `Vault` has: `storage: Storage`, `git: GitOps`, `notesRelDir: string`, `isProject: boolean`, `vaultFolderName: string`
- `isProject` is a boolean — not a discriminated tag for attachment provenance
- `vaultFolderName`: `""` (main), `".mnemonic"` (primary), `".mnemonic-<name>"` (sub-vault)

### VaultManager (`src/vault.ts:33-233`)

- `main: Vault` — the main/global vault
- `primaryProjectVaults: Map<string, Vault>` — keyed by resolved git root
- `allProjectVaultsByRoot: Map<string, Vault[]>` — primary + sub-vaults per root
- `mainGitRoot: string` — used to detect if a cwd belongs to the main vault's repo

### Discovery model (`loadAllVaultsForRoot`)

- Sub-vaults discovered via `discoverSubmoduleVaultFolders` — scans for `.mnemonic-*` directories
- Only loaded if directory exists
- Sub-vault embeddings are stored in the primary vault's embeddings directory (shared)

### Search order (`src/vault.ts:128-147`)

- `searchOrder(cwd)`: project vaults for cwd's git root first (primary, then sub-vaults), then main vault
- If no cwd or no project vaults found → just main vault

### findNote (`src/vault.ts:105-112`)

- Iterates `searchOrder(cwd)` sequentially, returns first match
- Only deduplicates by note id within a single call — no cross-vault id collision protection

## Config layer (`src/config.ts`)

### MnemonicConfig (`src/config.ts:16-22`)

```typescript
interface MnemonicConfig {
  schemaVersion: string;
  reindexEmbedConcurrency: number;
  mutationPushMode: MutationPushMode;
  projectMemoryPolicies: Record<string, ProjectMemoryPolicy>;
  projectIdentityOverrides: Record<string, ProjectIdentityOverride>;
}
```

- Stored in main vault's `config.json` (machine-local)
- `MnemonicConfigStore` at `src/config.ts:186-261` — wraps read/write with caching
- Config is machine-local, consistent with existing policy/identity override storage
- No attachment concept exists yet

## Project identity (`src/project.ts`)

- `detectProject(cwd)` → `ProjectInfo` with `id: ProjectId`, `name`, `source`, `remoteName`
- Identity from git remote URL, normalized to stable slug
- Supports `ProjectIdentityOverride` for forks (stored in main vault config)
- `findTopLevelGitRoot` walks submodule boundaries

## Storage layer (`src/storage.ts`)

- `Note.project` is a plain string (projectId or undefined for global)
- `Note.projectName` is human-readable display name
- `Note.id` is `MemoryId` (branded string) — no vault-scoping built in
- `Storage` constructor accepts optional `embeddingsDirOverride` (used by sub-vaults)

## Current output provenance

### storageLabel (`src/helpers/vault.ts:21-25`)

```typescript
function storageLabel(vault: Vault): string {
  if (!vault.isProject) return "main-vault";
  if (vault.vaultFolderName === ".mnemonic") return "project-vault";
  return `sub-vault:${vault.vaultFolderName}`;
}
```

- Three labels: `"main-vault"`, `"project-vault"`, `"sub-vault:<folder>"`
- No mechanism for external/attached provenance

### _VaultLabel Zod schema (`src/structured-content.ts:582`)

```typescript
const _VaultLabel = z.string().regex(/^main-vault$|^project-vault$|^sub-vault:\.mnemonic-.+$/);
```

- Only accepts these three patterns — will reject any new label format
- Used in every output schema: RecallResult, ListResult, GetResult, WhereIsResult, RecentResult, etc.

## Read paths that consume vault lists

### recall (`src/tools/recall.ts:124`)

```typescript
const vaults = await ctx.vaultManager.searchOrder(cwd);
```

Then iterates all vaults to score embeddings.

### project_memory_summary (`src/tools/project-memory-summary.ts:154`)

```typescript
const { project, entries } = await collectVisibleNotes(ctx, cwd, "all", undefined, "any", preProject?.id);
```

Which calls `searchOrder(cwd)` internally.

### list, recent_memories, memory_graph

All use `collectVisibleNotes` → `searchOrder`.

### get, findNote, where_is_memory, forget, update

All use `findNote` → `searchOrder`.

### collectVisibleNotes (`src/helpers/vault.ts:33-93`)

- Iterates vaults from `searchOrder(cwd)`
- Deduplicates by `note.id` using `Set<string>` (line 48, 70-71)
- Sorts entries by project relevance (current project first, other project, then global)
- `filterProject` derived from `scope` parameter

### dedup concern

`collectVisibleNotes` at line 70: `if (seen.has(note.id)) continue;`
If two vaults contain a note with the same id, the first one wins (project vault first, then main). With attachments, this could produce surprising results if an attached repo has a note id that shadows the primary project vault's note.

## Session cache (`src/cache.ts`)

- `SessionProjectCache` keyed by `projectId`
- `vaultCaches: Map<string, VaultCache>` keyed by `vaultPath` (absolute path)
- `getOrBuildVaultNoteList(projectId, vault)` — builds lazily per vault
- Cache invalidation on mutations via `invalidateActiveProjectCache()`

## Sync (`src/tools/sync.ts`)

- Syncs main vault always, project vault if cwd has `.mnemonic/`
- `SyncResultSchema` vault type is `z.enum(["main", "project"])` — no attachment concept
- Branch change auto-sync (`ensureBranchSynced` in `src/helpers/project.ts:62-92`): syncs main vault + primary project vault only

## Type system (`src/brands.ts`)

- `MemoryId`, `ProjectId` — branded strings
- Smart constructors with unchecked casts for internal code

## Performance constraints from implementation principles

- No new I/O on cold/fallback paths
- Fail-soft to undefined
- Derive from already-in-memory data
- Session cache reuse
- Contextual metrics always populated regardless of caller params
- Every new Zod field gets `.describe()`
- New output fields get bullets in tool description Returns
- New text rendering needs integration tests

## Key invariants

- `getOrCreateProjectVault` must only be called when user explicitly wants project write
- `getProjectVaultIfExists` is the safe read-only path
- Sub-vaults never auto-created — only loaded if directory exists
- Project ID from git remote URL, not local path (cross-machine consistency)

## TypeScript strictness

- `tsconfig.json`: `strict: true`, `noUncheckedIndexedAccess: true`
- Branded types used for domain primitives
- Branded type smart constructors exist but are unchecked casts
