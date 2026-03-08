# Plan

## ✅ Data format robustness and migration strategy

**Status: Implemented and dogfooded**

The migration framework is fully implemented and tested. All 20 notes in mnemonic's project vault have been migrated to include `memoryVersion: 1`.

**Key decisions already in place**:
- Schema version tracking at vault level (`schemaVersion: "1.0"`)
- Note format versioning (`memoryVersion: 1` in frontmatter)
- Explicit migration command with `--dry-run` support
- Automatic git commits of migrated files (only modified files, not all changes)
- Two-level versioning: semver for vault, integers for note format
- Strong encouragement to use `--dry-run` before executing

**See memory note**: `mnemonic-migration-strategy-7f2e8c3d.md` for full implementation details

## Dynamic project context loading

## Dynamic project context loading

Idea: add runtime support for loading and unloading active project context so mnemonic can stay simple at small scale while handling larger numbers of projects and memories more efficiently.

### Why

- Reduce recall noise when many projects exist.
- Improve latency by keeping only active project context hot.
- Preserve access to global memories without treating every project as equally active.
- Create a path to scale beyond the current "personal or small-team, low-thousands of memories" sweet spot.

### Possible approach

- Introduce the concept of an active project working set.
- Keep global memories always available, but load project memories on demand.
- Cache embeddings, summaries, and relationship neighborhoods for recently active projects.
- Unload inactive project caches with an LRU or idle-time policy.
- Expand from project-local memories to global memories only when similarity or relationships justify it.

### Potential MCP surface

- `activate_project_context`
- `deactivate_project_context`
- `list_active_contexts`
- optional automatic activation based on `cwd`

### Likely pressure points

- cache invalidation when notes change
- interaction with `recall` project boosting
- project-to-global relationship traversal
- sync/reindex behavior for loaded vs unloaded projects
- maintaining the current simple file-first architecture

### Success criteria

- Faster recall in multi-project setups
- Less irrelevant cross-project retrieval
- No loss of useful global memory recall
- No requirement for a dedicated database or always-on service

## CI failure learning capture

**Status: Implemented**

Goal: capture useful CI failure learnings without letting CI write noisy or conflicting memory notes automatically.

### Decision

- Start with artifact-only CI learning capture
- Add manual promotion into mnemonic via `workflow_dispatch`
- Do not use a fixed note; create one note per promoted incident or failure pattern
- Do not require a real Ollama daemon in CI for v1

### Implemented scope

- `.github/workflows/ci.yml` now captures test output, summarizes failed runs deterministically, and uploads a `ci-learning` artifact
- `scripts/ci/collect-test-failure.mjs` emits both `ci-failure-raw.json` and `ci-learning.md`
- `.github/workflows/promote-ci-learning.yml` supports manual `workflow_dispatch` promotion from a selected run id
- `scripts/ci/promote-learning.mjs` promotes artifacts through the real MCP entrypoint using a fake local embeddings endpoint instead of requiring live Ollama in CI
- `AGENT.md` documents the artifact-first/manual-promotion workflow
- The MCP integration smoke test now uses an explicit 15s timeout to stay reliable on shared CI runners

### Outcome

- CI failure learnings are captured without automatic noisy repo writes
- Promotion into mnemonic stays intentional and reviewable
- The implementation remains CI-safe and does not require a real Ollama daemon

### Phase 1 — artifact-only failure capture

#### Scope

- Update `.github/workflows/ci.yml` to capture test output to files while preserving the real test exit code
- On failure, run a deterministic summarizer script
- Upload normalized artifacts for later inspection and promotion

#### Files

- `.github/workflows/ci.yml`
- `scripts/ci/collect-test-failure.mjs`

#### Deliverables

- `ci-failure-raw.json`
- `ci-learning.md`

#### Acceptance criteria

- A failing CI run uploads both artifacts
- The markdown artifact is readable without opening the raw JSON
- The JSON artifact includes a stable `failure_signature`
- The summarizer strips obvious machine-specific path noise and volatile details

### Phase 2 — manual promotion workflow

#### Scope

- Add `.github/workflows/promote-ci-learning.yml` with `workflow_dispatch`
- Allow maintainers to promote a learning artifact from a selected run into mnemonic through the local MCP entrypoint

#### Files

- `.github/workflows/promote-ci-learning.yml`
- `scripts/ci/promote-learning.mjs`

#### Acceptance criteria

- A maintainer can provide a `run_id` and promote a prior failure artifact
- Promotion uses `scripts/mcp-local.sh` rather than bypassing MCP
- Promoted notes include the `failure_signature`, CI metadata, and a concise lesson
- Promotion creates a new note rather than appending to a fixed note

### Phase 3 — documentation and validation

#### Scope

- Document the artifact-first / manual-promotion workflow in `AGENT.md`
- Validate locally with a synthetic failing Vitest output and in CI with a temporary failing branch

#### Acceptance criteria

- The workflow is documented for future contributors
- Local dry-runs can generate both artifacts and promote a note through MCP
- The implementation does not require a live Ollama daemon in CI

### Implementation checklist

- [x] Create deterministic CI failure summarizer
- [x] Capture test output in CI and upload failure artifacts
- [x] Add manual promotion workflow with `workflow_dispatch`
- [x] Promote artifacts through MCP with repo context
- [x] Document the workflow and rationale in `AGENT.md`
- [x] Validate local and GitHub Actions paths end-to-end
