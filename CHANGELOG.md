# Changelog

All notable changes to `mnemonic` will be documented in this file.

The format is loosely based on Keep a Changelog and uses semver-style version headings.

## [0.5.1] - 2026-03-12

### Fixed

- `GitOps.commitWithStatus` now passes the explicit file list to `git commit` so that staged changes outside the vault are never accidentally included in a mnemonic commit. Previously `git.commit(message)` was called with no path arguments, which committed everything in the index — including unrelated files that happened to be staged in the same repo.

## [0.5.0] - 2026-03-12

### Changed

- **Self-describing tools — no system prompt required.** All 22 MCP tools now include detailed descriptions with "use when" / "do not use when" decision boundaries, follow-up tool hints, and side-effect documentation. Tool-level `annotations` (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) are set on every tool. Parameter descriptions are enriched with semantics, examples, and guidance (e.g. `lifecycle`, `summary`, `cwd`, `scope`). The 141-line `SYSTEM_PROMPT.md` has been replaced by a one-liner fallback — models discover correct behavior from tool metadata alone.
- Upgraded `zod` to `^4.3.6` and aligned schema declarations with Zod v4's stricter `z.record` signature to keep MCP structured-output validation and type-checking consistent.

## [0.4.1] - 2026-03-11

### Added

- Docker image published to `danielmarbach/mnemonic-mcp` on Docker Hub for `linux/amd64` and `linux/arm64`. Tagged with the release version and `latest`.

### Fixed

- `list_migrations` now returns structured content that matches its declared MCP output schema. The handler already included `totalPending`, but the zod schema omitted it, causing the tool to fail with a structured-content validation error instead of listing migrations.

## [0.4.0] - 2026-03-11

### Added

- Unadopted project detection in `remember`: when a project has no saved memory policy and no existing `.mnemonic/` directory, mnemonic now asks which vault to use instead of silently creating `.mnemonic/`. The prompt distinguishes first-time adoption from an explicit `ask` policy, and hints to call `set_project_memory_policy` to avoid being prompted again.

## [0.3.2] - 2026-03-11

### Fixed

- `consolidate` `execute-merge` now resolves `sourceIds` from the full vault scan instead of the scope-filtered note list. Previously, merging a purely global note with a project-associated note in a single call silently failed with "Source note not found" because each scope filter excluded the other scope's notes. Explicit `sourceIds` now bypass scope filtering — the caller owns the scope decision.

## [0.3.1] - 2026-03-11

### Fixed

- Path resolution now correctly supports home-directory shorthand (`~`) for user-configurable paths before absolute resolution. `VAULT_PATH` and `CLAUDE_HOME` no longer resolve to accidental cwd-relative paths when configured with tildes.
- `import-claude-memory` now applies the same home-aware path resolution to CLI options (`--cwd`, `--claude-home`) for consistent behavior across absolute and home-based paths.

## [0.3.0] - 2026-03-10

### Added

- `recall` now backfills missing and stale embeddings on demand before searching. Notes that arrived via `git pull` without a local embedding, or that were edited directly in an editor after their embedding was written, are re-embedded automatically. If Ollama is unavailable the backfill fails silently and recall continues with existing embeddings.

### Fixed

- `parseNote` in `Storage` now converts gray-matter `Date` objects to ISO strings for `createdAt` and `updatedAt`. YAML frontmatter with unquoted ISO timestamps is parsed by gray-matter as JS `Date` instances; notes arriving via `git pull` from another machine were affected, causing output validation errors on recall.
- `pushWithStatus` in `GitOps` now returns `{ status: "failed", error }` instead of throwing on push failure. Previously, any push error caused mutating MCP tools (`remember`, `update`, `consolidate`, etc.) to return `isError: true` even though the note was committed successfully. The `PersistenceStatus` schema gains a `"failed"` push status and a `pushError` field to surface the failure detail without blocking the operation.
- `consolidate` `execute-merge` now reuses an existing consolidated target note on retry when the same source notes already point to the same `supersedes` target with the same title. This prevents duplicate consolidated notes after partial-success retry flows and keeps repeated merge attempts idempotent without requiring caller-supplied ids.

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
