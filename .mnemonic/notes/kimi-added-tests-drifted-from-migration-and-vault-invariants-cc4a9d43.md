---
title: Kimi-added tests drifted from migration and vault invariants
tags:
  - testing
  - dogfooding
  - kimi
  - migration
  - vault
  - lessons
createdAt: '2026-03-08T19:25:38.819Z'
updatedAt: '2026-03-08T19:25:38.819Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Dogfooding lesson: several recent Kimi-authored tests in `tests/migration.test.ts`, `tests/storage.test.ts`, and `tests/vault.test.ts` drifted from the actual system invariants and created false failures.

What drifted:

- Some migration tests still referenced an old migration name (`add-memory-version-field`) after the built-in migration was renamed to `v0.1.0-backfill-memory-versions`.
- Some storage tests expected legacy notes to keep `memoryVersion` undefined, but the designed compatibility behavior is to normalize missing or invalid versions to `0` during read.
- Some vault tests assumed `VaultManager` should preload or search every loaded project vault, but the intended behavior is current-project-first plus main-vault fallback.
- Some migration tests wrote schema state to `schema-version.json`, but the real vault schema source of truth is `config.json`.

Practical rule: when a new failing test comes from recent agent work, verify it against stored architecture decisions and current runtime behavior before changing production code. Fix stale tests when they contradict documented invariants; fix code only when the test exposes a real behavior bug.
