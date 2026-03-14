---
title: Migration infrastructure implementation summary (consolidated)
tags:
  - architecture
  - migration
  - implementation
  - schema
  - decisions
  - mcp-tools
lifecycle: permanent
createdAt: '2026-03-14T23:34:02.745Z'
updatedAt: '2026-03-14T23:34:02.745Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mnemonic-key-design-decisions-3f2a6273
    type: related-to
memoryVersion: 1
---
Combine the migration strategy and implementation notes into one canonical memory that preserves both the architectural rationale and the delivered behavior without duplicate recall results.

Implemented mnemonic's migration infrastructure and captured the durable strategy in one canonical note.

Key durable points:
- Use two-level versioning: `schemaVersion` in vault config for migration-system evolution, and integer `memoryVersion` in note frontmatter for note-format evolution.
- Prefer explicit migrations for structural changes and on-the-fly compatibility for additive changes.
- Strongly encourage `dryRun` first, but do not force it.
- Migration commits should include only migration-touched files, not unrelated workspace changes.
- Migrations must be idempotent, support per-vault execution, and provide clear reporting.

What was delivered:
- Migration framework with dry-run and execute modes
- `list_migrations` and `execute_migration` support
- Initial backfill migration for `memoryVersion`
- Tests covering version comparison, dry-run behavior, error handling, and idempotency

This note replaces the separate strategy and implementation notes so recall surfaces one authoritative migration record.
