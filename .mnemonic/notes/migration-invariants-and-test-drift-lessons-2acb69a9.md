---
title: Migration invariants and test-drift lessons
tags:
  - migration
  - ordering
  - idempotency
  - per-vault
  - versioning
  - robustness
  - testing
  - decisions
  - dogfooding
  - kimi
  - vault
  - lessons
lifecycle: permanent
createdAt: '2026-03-08T19:26:40.116Z'
updatedAt: '2026-10-11T06:43:36.230Z'
project: github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Consolidates the migration robustness invariants with the later dogfooding lesson that some Kimi-authored tests drifted from those invariants, so there is one canonical memory covering both the intended behavior and how to validate future failing tests against it.

## Consolidated from

### Migration infrastructure: robustness, ordering, idempotency, per-vault versioning

*Source: `migration-and-consolidate-robustness-hardening-cb012cfc`*

Migration hardening now has executable invariant coverage and explicit architecture guidance.

**Executable invariant checks:**

- State-machine style tests now cover dry-run -> execute -> repeat execute stability, plus interrupted-run rollback followed by clean retry.
- Cross-session coverage now verifies a project vault migrated in one session is skipped by a later broader run once its per-vault schema version is current.
- Atomic rollback, idempotency, ordering, and per-vault schema advancement remain covered in `tests/migration.test.ts`.

**Documented invariants:**

- `ARCHITECTURE.md` now records the core migration invariants: schema only advances after full vault success, failed runs do not flush partial writes, migrations must be idempotent, pending migrations execute in schema order, and fresh installs depend on `defaultConfig.schemaVersion` matching the latest schema.
- `src/config.ts` now embeds the checklist rule directly above `defaultConfig.schemaVersion`.
- `AGENT.md` keeps the same rule in the migration workflow guidance.

**Practical conclusion on formal methods:**

- With these tests and invariants in place, TLA+ is still probably not worth the cost right now.
- If migration orchestration later gains concurrency, resumability, or distributed coordination, revisiting a small formal model could make sense.

### Kimi-added tests drifted from migration and vault invariants

*Source: `kimi-added-tests-drifted-from-migration-and-vault-invariants-cc4a9d43`*

Dogfooding lesson: several recent Kimi-authored tests in `tests/migration.test.ts`, `tests/storage.test.ts`, and `tests/vault.test.ts` drifted from the actual system invariants and created false failures.

What drifted:

- Some migration tests still referenced an old migration name (`add-memory-version-field`) after the built-in migration was renamed to `v0.1.0-backfill-memory-versions`.
- Some storage tests expected legacy notes to keep `memoryVersion` undefined, but the designed compatibility behavior is to normalize missing or invalid versions to `0` during read.
- Some vault tests assumed `VaultManager` should preload or search every loaded project vault, but the intended behavior is current-project-first plus main-vault fallback.
- Some migration tests wrote schema state to `schema-version.json`, but the real vault schema source of truth is `config.json`.

Practical rule: when a new failing test comes from recent agent work, verify it against stored architecture decisions and current runtime behavior before changing production code. Fix stale tests when they contradict documented invariants; fix code only when the test exposes a real behavior bug.

## Vaults without config.json, config rewrites, and writer enumeration

- **A vault without `config.json` means "unknown", not "current".** `readVaultSchemaVersion` falls back to the default (latest) version for other callers, so pending-migration computation looked at config-less vaults and saw nothing to do. Project vaults never got a `config.json` unless a migration had already run, so the vaults that most needed a migration could never be selected. Pending computation now uses `readVaultSchemaVersionForMigration`, which returns `0.0` when the file is missing; all migrations are idempotent, so running everything is safe. New main and project vaults write and commit `config.json` with the current schema version at creation so fresh installs do not nag.
- **Migrations may rewrite `config.json`** (attachment config, project id keys). Results report that separately through `configModified`; it is not a note count, and `config.json` is committed whenever it was rewritten, even if the schema version does not advance. The notes transaction does not cover config writes.
- **Every writer of a file must honor its safety rule.** The first fix for "unparseable config.json gets clobbered" covered the setters but missed `writeVaultSchemaVersion`, which the migrator calls. A reviewer closing a data-loss path must enumerate every writer, not only the one named in the report.
- **A migration rewriting a field must not move `updatedAt`** and must leave other frontmatter untouched; `writeNote` re-serialization drops unknown frontmatter keys, which is pre-existing behavior.
- **Caveat:** `runMigration` by name on a config-less vault stamps the latest schema without running the older backfills (reads normalize those fields, so the effect is cosmetic). `runAllPending` is the safe path.
- **Legacy data must be understood at the read boundary before the migration runs** (parseNote, config readAll), because other clones of a project vault migrate independently and attached vaults are not reached by the migrator.
