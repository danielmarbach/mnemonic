---
title: 'Multi-vault architecture: .mnemonic-<name> sub-vault support'
tags:
  - architecture
  - vault
  - multi-vault
  - submodule
  - design
  - decision
lifecycle: permanent
createdAt: '2026-03-14T00:23:48.222Z'
updatedAt: '2026-03-24T10:53:53.576Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: vault-creation-audit-which-tools-can-create-mnemonic-and-whi-d0388691
    type: related-to
  - id: sub-vault-label-convention-sub-vault-folder-not-bare-folder--6544a2c2
    type: explains
  - id: multi-vault-architecture-sub-vault-support-and-label-convent-d5e5840d
    type: supersedes
memoryVersion: 1
---
Added support for multiple vault folders per project git root. A project can now have `.mnemonic` (primary) alongside any number of `.mnemonic-<name>` sub-vault folders. All share the same git root and embeddings directory. The vault label for sub-vault folders is `sub-vault:<folder>` (e.g. `sub-vault:.mnemonic-lib`).

## Discovery model

`VaultManager.loadAllVaultsForRoot()` (called by `getOrCreateProjectVault` and `getProjectVaultIfExists`) now does two things:

1. Loads the primary `.mnemonic` vault as before.
2. Scans for `.mnemonic-*` directories at the git root and loads each as a sub-vault.

Sub-vaults are only loaded if the directory already exists — they are never auto-created. `discoverSubmoduleVaultFolders()` returns a sorted list of all `.mnemonic-*` names.

## Embeddings sharing

Sub-vault `Storage` instances receive the primary vault's `embeddingsDir` as `embeddingsDirOverride`. Embeddings for notes in `.mnemonic-sub/notes/*.md` are therefore stored in `.mnemonic/embeddings/` — not in `.mnemonic-sub/embeddings/`. This satisfies the requirement that all embeddings for a project live in one place.

## Data model changes

- `Vault` gains `vaultFolderName: string`: `""` for main vault, `".mnemonic"` for primary project vault, `".mnemonic-<name>"` for sub-vaults.
- `Storage` constructor gains optional `embeddingsDirOverride?: string`.
- `VaultManager` now maintains two internal maps keyed by resolved git root: `primaryProjectVaults` (one entry per root) and `allProjectVaultsByRoot` (array: primary first, then sub-vaults in sorted order).

## New VaultManager API

- `getVaultByFolder(cwd, folderName)` — returns a specific sub-vault by folder name; returns null if not found.
- `allKnownVaults()` — now includes all sub-vaults for all loaded roots.
- `searchOrder(cwd)` — includes primary vault then sub-vaults then main vault.

## Labels (storageLabel)

- `"main-vault"` — main vault (unchanged)
- `"project-vault"` — primary project vault `.mnemonic` (unchanged, backward compat)
- `"sub-vault:.mnemonic-<name>"` — sub-vault folders

The `storedIn` filter in `collectVisibleNotes` uses `vaultMatchesStorageScope()` which maps `"project-vault"` to `vault.isProject` so all project vaults (primary + sub) match.

## move_memory changes

`move_memory` gains an optional `vaultFolder` parameter. When `target="project-vault"` and `vaultFolder` is set (e.g. `".mnemonic-lib"`), the note moves to that specific sub-vault instead of the primary vault. The already-there check now compares vault instances (`found.vault === targetVault`) rather than label strings, which is robust across all vault types.

## Backward compatibility

Repositories with only a `.mnemonic` vault are unaffected. The primary project vault still loads and behaves exactly as before. Sub-vault discovery only adds vaults when `.mnemonic-*` directories are present.

## Key invariant

`getOrCreateProjectVault` still only creates the primary `.mnemonic` vault. Sub-vaults are discovered but never auto-created — callers must create the directory before mnemonic will load it.
