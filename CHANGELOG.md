# Changelog

All notable changes to `mnemonic` will be documented in this file.

The format is loosely based on Keep a Changelog and uses semver-style version headings.

## [0.3.0] - Unreleased

### Added

- `recall` now backfills missing and stale embeddings on demand before searching. Notes that arrived via `git pull` without a local embedding, or that were edited directly in an editor after their embedding was written, are re-embedded automatically. If Ollama is unavailable the backfill fails silently and recall continues with existing embeddings.

### Fixed

- `parseNote` in `Storage` now converts gray-matter `Date` objects to ISO strings for `createdAt` and `updatedAt`. YAML frontmatter with unquoted ISO timestamps is parsed by gray-matter as JS `Date` instances; notes arriving via `git pull` from another machine were affected, causing output validation errors on recall.
- `pushWithStatus` in `GitOps` now returns `{ status: "failed", error }` instead of throwing on push failure. Previously, any push error caused mutating MCP tools (`remember`, `update`, `consolidate`, etc.) to return `isError: true` even though the note was committed successfully. The `PersistenceStatus` schema gains a `"failed"` push status and a `pushError` field to surface the failure detail without blocking the operation.

## [0.2.0] - 2026-03-10

### Added

- `mnemonic import-claude-memory` CLI command imports Claude Code auto-memory notes into the vault. Each `##` heading becomes a separate note tagged `claude-memory` and `imported`. Safe to re-run — notes whose titles already exist are skipped.
- `mutationPushMode` config option controls when mutating writes auto-push to the remote: `main-only` (default), `all`, or `none`. Prevents push failures on unpublished project branches while keeping the main vault in sync automatically.

### Changed

- Published to the public npm registry with provenance attestation via OIDC trusted publishing. No authentication required to install.
- Renovate configured for automated dependency updates.

## [0.1.0] - 2026-03-08

First public release candidate.

### Added

- Plain markdown + JSON storage with git-backed main and project vaults.
- MCP tools for capture, recall, relationships, consolidation, project identity, policies, migrations, and vault operations.
- Project-scoped memory routing with separate storage location and project association semantics.
- Structured MCP responses for tool consumers.
- Migration framework with per-vault schema versioning and `v0.1.0-backfill-memory-versions`.
- CI-safe MCP integration tests plus unit coverage for storage, vault routing, and migration behavior.

### Changed

- `move_memory` now rewrites project metadata when moving into a project vault and preserves project association when moving to the main vault.
- Migration execution now serializes per vault to avoid concurrent atomic-write collisions.
- Legacy notes normalize missing or invalid `memoryVersion` values to `0` when read.
- Vault search order now stays focused on the current project vault plus main vault fallback.

### Fixed

- Malformed markdown files without frontmatter are no longer treated as valid notes.
- Explicit migration runs now persist schema version updates correctly.
- Recent stale migration, storage, and vault tests were reconciled with the actual runtime invariants.

### Caveats

- This is still an early release. Storage format, migration flow, and some MCP ergonomics may continue to evolve.
- Existing vaults should be considered migratable rather than permanently stable at this stage.
- Ollama is required locally for embeddings; CI uses a fake embeddings endpoint for hermetic tests.
