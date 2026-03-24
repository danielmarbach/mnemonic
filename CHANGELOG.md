# Changelog

All notable changes to `mnemonic` will be documented in this file.

The format is loosely based on Keep a Changelog and uses semver-style version headings.

## [0.16.0] - 2026-03-24

### Added

- Bounded 1-hop relationship expansion layer (`src/relationships.ts`): `recall`, `project_memory_summary`, and `get` now surface direct related notes as compact previews, scored by same-project priority, anchor status, recency, and confidence.
- `recall` automatically attaches relationship previews to top results (top 1 by default, top 3 when result count is small). Previews appear in both text and structured output.
- `project_memory_summary` orientation entries (`primaryEntry` and `suggestedNext`) include bounded relationship previews, including the fallback primaryEntry when no anchor notes exist.
- `get` accepts an optional `includeRelationships` parameter; when true, each returned note includes a bounded 1-hop relationship preview in both text and structured output.

### Changed

- `RecallResult.results` entries now include an optional `relationships` field (`RelationshipPreview`).
- `GetResult.notes` entries now include an optional `relationships` field (`RelationshipPreview`).
- `OrientationNote` now includes an optional `relationships` field (`RelationshipPreview`).
- `discover_tags` now defaults to note-oriented tag suggestions using title/content/query context, returning bounded `recommendedTags`; broader inventory output is now explicit via `mode: "browse"`.

## [0.15.0] - 2026-03-23

### Added

- Projection layer: compact, deterministic derived representations of notes used as embedding input instead of raw title+content. Projections extract title, lifecycle, tags, summary, and headings (h1–h3) into a structured format capped at 1200 characters, improving embedding quality by removing prose noise and markdown formatting.
- `project_memory_summary` now uses projection summaries for related global note previews when available, falling back to content extraction. Previews are capped at 100 characters for consistent output.

### Changed

- All embedding operations (`remember`, `update`, `embedMissingNotes`, `consolidate`) now use `embedTextForNote()` which builds projections on demand and falls back to raw title+content if projection fails. Embeddings are never blocked by projection errors.
- Projections are stored in `vaultPath/projections/` as JSON files alongside embeddings, gitignored and never synced. Each projection includes `noteId`, `title`, `summary`, `headings`, `tags`, `lifecycle`, `updatedAt` (staleness anchor), `projectionText` (what's embedded), and `generatedAt`.
- Staleness detection is timestamp-based: a projection is stale when `projection.updatedAt !== note.updatedAt`. No hashing required.

## [0.14.0] - 2026-03-22

### Added

- `recall` now supports opt-in temporal history via `mode: "temporal"`, preserving semantic-first selection while enriching top matches with compact git-backed history entries.
- `project_memory_summary` returns themed note categories, anchor notes, and an orientation layer for fast session-start navigation.
- `recall` results now include optional `provenance` (git-backed commit metadata) and `confidence` metadata.

### Changed

- `ProjectSummaryResult.themes` changed from `Record<string, number>` to `Record<string, ThemeSection>` with `count` and `examples` fields.
- `ProjectSummaryResult` now includes required `orientation` field with `primaryEntry`, `suggestedNext`, and optional `warnings`.
- `RecallResult.results` now accepts optional `history` entries for temporal recall, with optional `stats` in verbose mode.
- `OrientationNote` now includes optional `provenance` and `confidence` fields.

## [0.13.1] - 2026-03-20

### Fixed

- `relate` and `unrelate` now reconcile pending git changes when relationships already exist in note content. Previously, if git operations failed (e.g., transient `.git/index.lock` errors) after note mutations succeeded, retries returned "relationship already exists" without committing the staged changes, leaving the vault in an inconsistent state.

## [0.13.0] - 2026-03-19

### Changed

- `mnemonic-workflow-hint` is now written as an imperative decision protocol aimed at weaker models: start with `recall` or `list`, inspect with `get`, prefer `update` for existing memories, and only `remember` when nothing relevant matches.
- Phase-aware tool descriptions now front-load prerequisite wording for `remember`, `get`, `update`, `relate`, `consolidate`, and `move_memory` so models do less workflow inference from negative wording alone.

## [0.12.2] - 2026-03-19

### Fixed

- Project vault gitignore is now only created during intentional vault creation (`getOrCreateProjectVault`), not during read-only access via `getProjectVaultIfExists`.

## [0.12.1] - 2026-03-18

### Fixed

- `sync` now surfaces git failures as structured per-phase errors (`fetch`, `pull`, `push`) instead of silently swallowing them — merge conflicts include conflicted file paths and an actionable resolution hint.
- `SyncResult` structured output gains a `gitError` field per vault so callers can distinguish a clean no-op from a failed sync.

## [0.12.0] - 2026-03-15

### Added

- `discover_tags` MCP tool: lists existing tags with usage counts, example note titles, lifecycle distribution, and `isTemporaryOnly` flags for consistent tag terminology across sessions.

## [0.11.3] - 2026-03-15

### Fixed

- `git.add()` index.lock errors now retry with exponential backoff before failing, matching the retry behavior for `git.commit()` failures.
- Retry contract now includes `operation` field indicating whether add or commit failed, so clients can retry appropriately.

## [0.11.2] - 2026-03-15

### Fixed

- `consolidate` with `strategy: "find-clusters"` now includes computed theme groups and relationship clusters in structured output.

## [0.11.1] - 2026-03-15

### Fixed

- Mutating MCP tools now surface actionable git failure details more consistently when persistence only reaches local disk or the staged index. Text responses now include commit errors and retry guidance instead of vague `local-only` outcomes.
- `relate` and `unrelate` now expose the same retry visibility pattern as other mutating tools, making partial-persistence failures easier to diagnose and recover from in local MCP flows.

## [0.11.0] - 2026-03-15

### Added

- Automatic branch change detection now syncs vault state for `cwd`-aware operations after git branch switches, keeping embeddings current without a manual `sync`.

### Fixed

- `remember` now enforces protected-branch policy for explicit `scope: "project"` writes instead of allowing direct commits to protected branches.
- Branch-switch auto-sync now covers the remaining `cwd`-aware memory operations and `execute_migration`, with direct tests for real branch change detection.

## [0.10.0] - 2026-03-14

### Changed

- Performance in hot read paths: `recall` now reuses note reads within a single request instead of re-reading the same note during scoring and formatting.
- Consolidation analysis (`detect-duplicates`, `suggest-merges`) now preloads embeddings once per note and reuses vectors during pairwise similarity checks.
- `Storage.listNotes` and `Storage.listEmbeddings` now load files in parallel to reduce serialized disk I/O while preserving existing output behavior.
- `VaultManager.searchOrder` now avoids duplicate git-root resolution in a single call, reducing unnecessary git subprocess work in read-heavy flows.
- Mutating tools now return deterministic retry metadata when a git commit fails after the mutation is already written, including attempted commit message/body/files and retry safety hints.
- Commit persistence reporting now includes explicit commit-failure details (`git.commit=failed` with `commitError`) so recovery can be automated without reconstructing commit intent.

## [0.9.0] - 2026-03-14

### Added

- `mnemonic-workflow-hint` MCP prompt: optional, on-demand workflow guidance covering the discover → inspect → modify → organize pattern, storage-label model, and `recall` → `get` → `update` preference.
- `remember` tool gains `checkedForExisting` optional boolean field — schema-only agent hint indicating `recall` or `list` was checked before writing.

### Changed

- `remember` tool: tightened "Do not use when" guidance, improved `cwd` and `lifecycle` field descriptions.
- Removed system prompt one-liner from README and website; `SYSTEM_PROMPT.md` is now the canonical agent instructions file and points to `mnemonic-workflow-hint`.

## [0.8.1] - 2026-03-14

### Changed

- The publish workflow now updates the Homebrew formula through an automated pull request instead of pushing directly to `main`.
- `workflow_dispatch` now supports job toggles (`run_npm`, `run_docker`, `run_homebrew`, `run_release`) so partial release failures can be resumed by rerunning only remaining jobs.

## [0.8.0] - 2026-03-14

### Changed

- All MCP tool descriptions rewritten for self-contained routing and sub-vault awareness

### Added

- Homebrew tap support: `brew install danielmarbach/mnemonic/mnemonic-mcp`.
- Git submodule support: project vault creation and identity resolution now walk up through submodule boundaries to the superproject root.
- Multi-vault support: project git roots can contain multiple vault folders (`.mnemonic-<name>`) alongside the primary `.mnemonic/`. Sub-vaults share the primary vault's embeddings directory and appear in `searchOrder`, `allKnownVaults`, and all list/recall operations.
- `move_memory` accepts optional `vaultFolder` parameter to target specific sub-vaults.
- `Storage` accepts optional `embeddingsDirOverride` to redirect where embeddings are stored.
- `Vault` interface gains `vaultFolderName` field.
- `VaultManager` exposes `getVaultByFolder(cwd, folderName)` method.

## [0.7.0] - 2026-03-13

### Added

- Protected-branch one-time override input (`allowProtectedBranch`) for additional mutating tools that can commit to project vaults: `update`, `forget`, `move_memory`, and `consolidate` (mutating strategies).
- Integration coverage for protected-branch policy now verifies ask/override flows across `update`, `forget`, `move_memory`, and `consolidate` in addition to `remember`.

### Changed

- Protected-branch policy enforcement now applies consistently to automatic project-vault commits from mutating tools, not just `remember`. Affected paths include `update`, `forget`, `move_memory`, and mutating `consolidate` strategies (`execute-merge`, `prune-superseded`).
- Protected-branch guidance text now references the active tool when suggesting one-time override retries.
- Tool descriptions/docs were updated to reflect cross-tool protected-branch behavior in `README.md`, `AGENT.md`, and `docs/index.html`.

## [0.6.0] - 2026-03-13

### Added

- Protected-branch policy support for automatic `remember` project-vault commits. `ProjectMemoryPolicy` now supports `protectedBranchBehavior` (`ask` | `block` | `allow`) and `protectedBranchPatterns` (glob-like patterns). Built-in patterns are `main`, `master`, and `release*`.
- `remember` now accepts `allowProtectedBranch` as a one-time override when a protected-branch policy would otherwise ask or block.

### Changed

- `set_project_memory_policy` and `get_project_memory_policy` now manage and display protected-branch settings in addition to write-scope and consolidation defaults.
- `remember` now checks the current local git branch before automatic project-vault commits (scope omitted) and follows protected-branch policy with actionable guidance.

## [0.5.1] - 2026-03-12

### Fixed

- `GitOps.commitWithStatus` now passes the explicit file list to `git commit` so that staged changes outside the vault are never accidentally included in a mnemonic commit. Previously `git.commit(message)` was called with no path arguments, which committed everything in the index — including unrelated files that happened to be staged in the same repo.
- `consolidate` `execute-merge` no longer creates a `.mnemonic/` directory as a side effect when `cwd` points to a project that has not adopted mnemonic. Previously `executeMerge` called `getOrCreateProjectVault(cwd)` unconditionally, initialising the project vault even when all source notes lived in the main vault. It now calls `getProjectVaultIfExists`, consistent with the unadopted-project protection already present in `remember`.

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
