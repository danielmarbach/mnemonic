---
title: Migration and consolidate robustness hardening
tags:
  - migration
  - consolidate
  - robustness
  - dogfood
  - decisions
createdAt: '2026-03-08T07:44:07.713Z'
updatedAt: '2026-03-08T07:44:07.713Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Strengthened migration and consolidate behavior after reviewing the recent changes.

- `runAllPending()` now loads config through `MnemonicConfigStore`, reuses `runMigration()` so dry-run and execute paths stay aligned, and only advances `schemaVersion` after successful non-cwd runs.
- Schema versions are normalized and validated, and invalid `memoryVersion` frontmatter now falls back to `0` so the backfill migration can repair malformed notes.
- Consolidate delete-mode now deduplicates `sourceIds`, rejects empty target titles, preserves relationship type variants when merging, and cleans dangling references from surviving notes after source deletion or prune.
- Dogfooding validated `list_migrations`, `execute_migration` dry-run, and a full consolidate delete workflow with MCP-created temporary notes.
- Direct git-backed dogfooding exposed that concurrent memory writes can hit git index locking and signed commits can fail in this environment, so sequential validation with `DISABLE_GIT=true` was used to verify consolidation behavior cleanly.
