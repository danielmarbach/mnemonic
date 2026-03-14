---
title: 'sub-vault label convention: sub-vault:<folder> not bare folder name'
tags:
  - architecture
  - vault
  - labels
  - design
  - decision
  - multi-vault
lifecycle: permanent
createdAt: '2026-03-14T00:24:21.870Z'
updatedAt: '2026-03-14T00:24:21.870Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Sub-vault folders (`.mnemonic-<name>`) use the label `sub-vault:<folder>` in all structured MCP output (e.g. `sub-vault:.mnemonic-lib`) rather than exposing the bare folder name or a generic `sub-vault` string.

## Decision rationale

Three alternatives were considered:

1. **Bare folder name** (`.mnemonic-lib`) — clean but lacks a type signal. A consumer has to infer the type from the `.mnemonic-` prefix, which is an internal implementation detail leaking into the API surface.
2. **Generic `sub-vault`** — type is clear but loses identity. Cannot distinguish `.mnemonic-lib` from `.mnemonic-widget` without a separate field.
3. **`sub-vault:<folder>`** (chosen) — both the type (`sub-vault`) and the specific folder (`.mnemonic-lib`) are present in a single string. Consistent with how vault labels are already surfaced in text output, commit messages, and structured responses.

## Impact

- `storageLabel(vault)` returns `sub-vault:<vault.vaultFolderName>` for all vaults where `isProject=true` and `vaultFolderName !== ".mnemonic"`.
- Existing values `"main-vault"` and `"project-vault"` are unchanged (backward compat).
- `_VaultLabel` schema in `structured-content.ts` is now `z.string()` (was `z.enum(["project-vault","main-vault"])`), accepting any string while still treating the canonical values specially in code.
- The `storedIn` filter (`"project-vault"`) covers all project vaults including sub-vaults via `vaultMatchesStorageScope()` — the label string is NOT used for this filter.
