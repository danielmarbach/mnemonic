---
title: 'Multi-vault architecture: sub-vault support and label conventions'
tags:
  - architecture
  - vault
  - multi-vault
  - design
  - decision
lifecycle: permanent
createdAt: '2026-03-24T10:53:53.576Z'
updatedAt: '2026-03-24T10:53:53.576Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: vault-creation-audit-which-tools-can-create-mnemonic-and-whi-d0388691
    type: related-to
memoryVersion: 1
---
## Architecture

A project can have a primary `.mnemonic` vault alongside any number of `.mnemonic-<name>` sub-vault folders. All share the same git root and embeddings directory.

### Discovery model

`VaultManager.loadAllVaultsForRoot()` loads the primary `.mnemonic` vault, then scans for `.mnemonic-*` directories and loads each as a sub-vault. Sub-vaults are only loaded if the directory already exists — never auto-created. `getOrCreateProjectVault` still only creates the primary `.mnemonic` vault.

### Embeddings sharing

Sub-vault `Storage` instances receive the primary vault's `embeddingsDir` as `embeddingsDirOverride`. All embeddings for a project live in `.mnemonic/embeddings/`, regardless of which sub-vault a note belongs to.

### Data model

- `Vault` gains `vaultFolderName: string`: `""` for main vault, `".mnemonic"` for primary project vault, `".mnemonic-<name>"` for sub-vaults
- `Storage` constructor gains optional `embeddingsDirOverride?: string`
- `VaultManager` maintains `primaryProjectVaults` (one per root) and `allProjectVaultsByRoot` (primary first, then sub-vaults sorted)

### VaultManager API additions

- `getVaultByFolder(cwd, folderName)` — returns a specific sub-vault by folder name; null if not found
- `allKnownVaults()` — includes all sub-vaults for all loaded roots
- `searchOrder(cwd)` — primary vault, then sub-vaults, then main vault

### `move_memory` extension

Gains optional `vaultFolder` parameter. When `target="project-vault"` and `vaultFolder` is set (e.g. `".mnemonic-lib"`), the note moves to that specific sub-vault.

## Label convention: `sub-vault:<folder>`

Sub-vault folders use the label `sub-vault:<folder>` in all structured MCP output (e.g. `sub-vault:.mnemonic-lib`) — not the bare folder name, not a generic `sub-vault` string.

**Rationale:** Three alternatives were considered:
1. Bare folder name (`.mnemonic-lib`) — clean but leaks an internal prefix as a type signal
2. Generic `sub-vault` — type is clear but loses identity between multiple sub-vaults
3. `sub-vault:<folder>` (chosen) — both type and specific folder in one string, consistent with existing label surfacing

**Impact:**
- `storageLabel(vault)` returns `sub-vault:<vault.vaultFolderName>` for project vaults where `vaultFolderName !== ".mnemonic"`
- Existing values `"main-vault"` and `"project-vault"` unchanged (backward compat)
- `_VaultLabel` schema is `z.string()` (was `z.enum([...])`), accepting any string while treating canonical values specially
- The `storedIn: "project-vault"` filter covers all project vaults including sub-vaults via `vaultMatchesStorageScope()` — the label string is NOT used for filtering
