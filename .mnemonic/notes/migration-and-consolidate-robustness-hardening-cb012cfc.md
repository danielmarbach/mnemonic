---
title: >-
  Migration infrastructure: robustness, ordering, idempotency, per-vault
  versioning
tags:
  - migration
  - ordering
  - idempotency
  - per-vault
  - versioning
  - robustness
  - testing
  - decisions
createdAt: '2026-03-08T07:44:07.713Z'
updatedAt: '2026-03-08T10:24:03.558Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Strengthened migration behavior across multiple sessions.

**Robustness hardening (earlier):**

- `runAllPending()` loads config through `MnemonicConfigStore`, reuses `runMigration()` so dry-run and execute paths stay aligned.
- Schema versions are normalized and validated, and invalid `memoryVersion` frontmatter falls back to `0` so the backfill migration can repair malformed notes.

**Migration ordering guarantee:**

- `getPendingMigrations()` sorts results by target version (`maxSchemaVersion`, falling back to `minSchemaVersion`). Unbounded migrations sort last.
- Three tests verify: out-of-order registration, unbounded placement, and minSchemaVersion-only sorting.

**Idempotency contract:**

- The `Migration` interface has a JSDoc block documenting that all migrations MUST be idempotent.
- Reusable `assertMigrationIdempotent()` helper in `tests/migration-helpers.ts`.
- AGENT.md migration testing pattern references the helper as mandatory.

**Per-vault schema versioning:**

- Each vault now has its own `config.json` with `schemaVersion` — both main vault and project vaults.
- `readVaultSchemaVersion()` / `writeVaultSchemaVersion()` added to `config.ts` as lightweight per-vault helpers.
- `runAllPending()` refactored: determines pending migrations per-vault, runs per-vault, advances per-vault schema version independently on success.
- `Migrator` no longer uses `MnemonicConfigStore` — the configStore field was removed.
- `list_migrations` tool and CLI `--list` show per-vault versions.
- Project vault `config.json` is committed to git (not gitignored) so collaborators share schema state.

**Remaining open items (in REVIEW.md):**

- No startup warning for pending migrations (medium)
- Unbounded migrations always run — no version constraint enforcement (low)
- Partial migration commits — no atomic flush (low)
