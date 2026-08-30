# mnemonic

A local MCP memory server backed by plain markdown files, synced via git. No database. Project-scoped memory with hybrid semantic, exact-match, and relationship-aware recall.

For the high-level system map, see [`ARCHITECTURE.md`](ARCHITECTURE.md). For release notes, see [`CHANGELOG.md`](CHANGELOG.md).

## Why mnemonic

- Your MCP client can carry decisions, fixes, and context across sessions, so you do not have to re-explain the same project.
- Memories are plain markdown with YAML frontmatter. They are readable, diffable, mergeable, and easy to back up.
- No database or always-on service is required. mnemonic uses files, git, and a local Node process.
- Project-scoped recall favors the right repo context while keeping stronger global matches accessible.
- Hybrid recall finds conceptual matches as well as exact names, identifiers, phrases, error codes, and versions.
- Shared `.mnemonic/` notes travel with the repository, so project knowledge is not trapped in one person's chat history.
- Document-source attachments let you link external repos as read-only knowledge sources. Their markdown docs are indexed and searchable through recall alongside your memories.
- Embeddings stay local and gitignored. You get semantic retrieval without committing generated vector data.
- Every `remember`, `update`, and `consolidate` creates a semantic git commit. Your decision log and plans travel with the code in the same history.
- If you stop using mnemonic, your notes remain plain markdown with YAML frontmatter. The knowledge you gather stays independent and remains yours.

## Stability

The storage format is stable with migration support for any future changes. Keep an eye on the changelog; `list_migrations` shows pending work per vault after each update.

**Scale:** mnemonic favors simplicity and portability over large-scale knowledge bases.

- Hundreds to low thousands of notes: a good fit.
- Several thousand: often fine, depending on note size, machine speed, and embedding throughput.
- Within a session, notes and embeddings are cached after first access. Repeated `recall`, `get`, and `project_memory_summary` calls skip storage reads regardless of vault size.
- Very large collections: expect longer reindexing, higher recall latency, and more git churn.
- Many concurrent writers or massive scale: consider a dedicated database and indexing layer instead.

## Prerequisites

By default, mnemonic uses [Ollama](https://ollama.com) locally. Start Ollama and pull an embedding model:

```bash
ollama pull nomic-embed-text-v2-moe
```

`qwen3-embedding` models (0.6B, 4B, 8B) work with the same endpoints — locally only `EMBED_MODEL` changes (e.g. `EMBED_MODEL=qwen3-embedding:0.6b`); for remote or vLLM/LM Studio-style serving use `EMBED_PROVIDER=openai-compatible` with `EMBED_BASE_URL` (remote Ollama cannot use `OLLAMA_URL`, which is validated to localhost/private networks). Note that note embeddings always use a bounded projection (title, summary, headings), so a larger model context window mainly benefits document-source attachments: their chunk ceiling defaults to 4000 characters and is configurable via `EMBED_MAX_CHUNK_CHARS`.

Advanced users can use OpenAI-compatible endpoints, native OpenAI, or Gemini instead. Provider settings are environment-only; mnemonic never writes API keys to notes, embedding files, vault config, or git.

## Setup

### Native (Node.js 20+)

```bash
npm install
npm run build
npm test

# release-confidence gate (build + full tests + isolated dogfooding)
npm run verify:release
```

The gate fails on required dogfood checks and reports advisory findings separately in the dogfood output.

`npm run build` already runs `typecheck`, but running it explicitly first gives a faster failure loop when iterating on the codebase.

For local dogfooding, start the built MCP server with:

```bash
npm run mcp:local
```

This rebuilds first, then launches `build/index.js`, so MCP clients always point at the latest source.

For reproducible dogfooding of recency and relationship-navigation behavior, prefer the isolated dogfood runner over the live project vault. The isolated runner copies the current `.mnemonic` notes into a temporary workspace, runs the chosen pack there, and deletes the workspace afterward.

### Docker

```bash
docker compose build
docker compose up ollama-init  # pulls nomic-embed-text-v2-moe into the ollama volume (one-time)
```

Ollama runs as a container with a named volume (`ollama-data`) so downloaded models persist across restarts. The vault directory (`~/mnemonic-vault` by default) is bind-mounted from the host. Git credentials (`~/.gitconfig` and `~/.ssh`) are mounted read-only so push/pull work inside the container.

Override the vault location:

```bash
VAULT_PATH=/path/to/your-vault docker compose run --rm mnemonic
```

## Installing

### npm

Published to the public npm registry. No authentication required.

```bash
# Latest stable release
npm install @danielmarbach/mnemonic-mcp

# Specific release
npm install @danielmarbach/mnemonic-mcp@0.2.0
```

### Install bundled skills (Claude/OpenCode)

The npm package now includes `skills/**` plus a helper binary to install them into local skill directories.

```bash
# If mnemonic is installed in this project:
npx mnemonic-install-skills --target all --mode copy

# One-off install without adding dependency:
npx -y -p @danielmarbach/mnemonic-mcp mnemonic-install-skills --target all --mode copy
```

Supported targets:

- `--target claude` -> `~/.claude/skills`
- `--target opencode` -> `~/.config/opencode/skills`
- `--target all` -> both (default)
- `--target custom` -> only use `--target-dir` destinations
- `--target-dir <path>` -> add any custom client skill directory

Update flow after upgrading `@danielmarbach/mnemonic-mcp`:

```bash
npx mnemonic-install-skills --target all --mode copy --update
```

If you prefer automatic propagation without copy refreshes, use symlink mode:

```bash
npx mnemonic-install-skills --target all --mode symlink --update
```

After install, load and use the skill by name:

- Skill name: `mnemonic-rpi-workflow`
- Prompt counterpart: `mnemonic-rpi-workflow`

In clients that support explicit skill loading (for example Claude Code or OpenCode), load `mnemonic-rpi-workflow` before running multi-step RPIR workflows.

### Homebrew

The formula lives in this repository. Tap it with an explicit URL so no separate repository is needed:

```bash
brew tap danielmarbach/mnemonic-mcp https://github.com/danielmarbach/mnemonic
brew install mnemonic-mcp
```

Or in a single step (direct formula URL):

```bash
brew install --formula https://raw.githubusercontent.com/danielmarbach/mnemonic/main/Formula/mnemonic-mcp.rb
```

### Docker Hub

Pre-built images for `linux/amd64` and `linux/arm64`:

```bash
docker pull danielmarbach/mnemonic-mcp:latest

# Or a specific version
docker pull danielmarbach/mnemonic-mcp:0.5.0
```

## MCP client config

### Claude Desktop / Cursor (native)

```json
{
  "mcpServers": {
    "mnemonic": {
      "command": "npx",
      "args": ["@danielmarbach/mnemonic-mcp"],
      "env": {
        "VAULT_PATH": "/Users/you/mnemonic-vault"
      }
    }
  }
}
```

For a fixed installed version, point at the local binary instead:

```json
{
  "mcpServers": {
    "mnemonic": {
      "command": "/path/to/your/project/node_modules/.bin/mnemonic",
      "env": {
        "VAULT_PATH": "/Users/you/mnemonic-vault"
      }
    }
  }
}
```

### Claude Desktop / Cursor (Homebrew)

```json
{
  "mcpServers": {
    "mnemonic": {
      "command": "mnemonic",
      "env": {
        "VAULT_PATH": "/Users/you/mnemonic-vault"
      }
    }
  }
}
```

### Claude Desktop / Cursor (Docker)

```json
{
  "mcpServers": {
    "mnemonic": {
      "command": "docker",
      "args": ["compose", "-f", "/path/to/mnemonic/compose.yaml", "run", "--rm", "mnemonic"],
      "env": {
        "VAULT_PATH": "/Users/you/mnemonic-vault"
      }
    }
  }
}
```

> Ollama must be running before the MCP client invokes mnemonic. Start it once with `docker compose up ollama -d` and it will stay up between calls.

### OpenCode

Add to `~/.config/opencode/opencode.json` (global) or `opencode.json` in your project root:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "mnemonic": {
      "type": "local",
      "command": ["npx", "@danielmarbach/mnemonic-mcp"],
      "environment": {
        "VAULT_PATH": "/Users/you/mnemonic-vault"
      }
    }
  }
}
```

### Codex

Add to `~/.codex/config.toml` (global) or `.codex/config.toml` in a trusted project:

```toml
[mcp_servers.mnemonic]
command = "npx"
args = ["@danielmarbach/mnemonic-mcp"]

[mcp_servers.mnemonic.env]
VAULT_PATH = "/Users/you/mnemonic-vault"
```

For local development against this repository's source tree, use `npm run mcp:local` or point your MCP client at `scripts/mcp-local.sh`.

## Configuration

| Variable           | Default                                     | Description                                                                                                                                                                    |
| ------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `VAULT_PATH`       | `~/mnemonic-vault`                          | Path to your markdown vault                                                                                                                                                    |
| `EMBED_PROVIDER`   | `ollama`                                    | `ollama`, `openai-compatible`, `openai`, or `gemini`                                                                                                                           |
| `EMBED_MODEL`      | provider default                            | Embedding model. Defaults to `nomic-embed-text-v2-moe` for Ollama, `text-embedding-3-small` for OpenAI, and `gemini-embedding-2` for Gemini. Required for `openai-compatible`. |
| `EMBED_DIMENSIONS` | unset                                       | Optional provider-supported output dimensions                                                                                                                                  |
| `EMBED_MAX_CHUNK_CHARS` | unset                                  | Max characters per document-source chunk (200–100000, default 4000). A non-default value re-chunks attachments on the next sync.                                               |
| `OLLAMA_URL`       | `http://localhost:11434`                    | Ollama server URL, validated to localhost/private-network addresses                                                                                                            |
| `EMBED_BASE_URL`   | unset                                       | Base URL for `openai-compatible` endpoints such as LiteLLM, LM Studio, vLLM, or Ollama's OpenAI-compatible API                                                                 |
| `EMBED_API_KEY`    | unset                                       | Optional bearer token for `openai-compatible`; never persisted by mnemonic                                                                                                     |
| `OPENAI_BASE_URL`  | `https://api.openai.com`                    | Native OpenAI base URL; also used as fallback for `openai-compatible` when `EMBED_BASE_URL` is unset                                                                           |
| `OPENAI_API_KEY`   | unset                                       | Required for `EMBED_PROVIDER=openai`; also used as fallback for `openai-compatible` when `EMBED_API_KEY` is unset                                                              |
| `GEMINI_BASE_URL`  | `https://generativelanguage.googleapis.com` | Native Gemini API base URL                                                                                                                                                     |
| `GEMINI_API_KEY`   | unset                                       | Required for `EMBED_PROVIDER=gemini`; never persisted by mnemonic                                                                                                              |
| `DISABLE_GIT`      | `false`                                     | Set `true` to skip all git ops                                                                                                                                                 |

Provider configuration is read from the process environment at startup. Only non-secret compatibility metadata is stored in local gitignored embedding JSON files: provider, model, dimensions, metric, optional input mode, and compatibility key.

After changing `EMBED_PROVIDER`, `EMBED_MODEL`, `EMBED_DIMENSIONS`, or endpoint semantics behind the same model alias, call the `sync` MCP tool with `{ "force": true }` to rebuild local embeddings. Until rebuilt, incompatible embeddings are skipped rather than compared across vector spaces, so semantic recall may return fewer results.

Privacy note: Ollama keeps projection text local. OpenAI-compatible cloud proxies, native OpenAI, and Gemini send the note projection text used for embeddings to the configured external endpoint. Document-source attachments send each chunk's text (content plus heading ancestry and source path) to the configured embedding provider — use a local provider or do not attach a repository whose content is restricted.

### config.json

The main vault's `~/mnemonic-vault/config.json` holds machine-local settings that survive across sessions. You can edit it by hand. Unknown fields are ignored, and invalid values fall back to defaults.

User-tunable fields:

| Field                     | Default       | Description                                                          |
| ------------------------- | ------------- | -------------------------------------------------------------------- |
| `reindexEmbedConcurrency` | `4`           | Parallel embedding and cache reads during `sync` (capped 1 to 16)   |
| `mutationPushMode`        | `"main-only"` | When to auto-push after a write: `"all"`, `"main-only"`, or `"none"` |

`projectMemoryPolicies` and `projectIdentityOverrides` are written automatically by `set_project_memory_policy` and `set_project_identity`. You do not need to edit them by hand.
Project memory policies can include protected-branch settings (`protectedBranchBehavior`, `protectedBranchPatterns`) used by mutating tools when they commit to project vaults (`remember`, `update`, `forget`, `move_memory`, and mutating `consolidate` strategies).

For example, raise concurrency on a fast machine and disable auto-push everywhere:

```json
{
  "reindexEmbedConcurrency": 8,
  "mutationPushMode": "none"
}
```

## How it works

### Vault layout

Two vault types store notes:

**Main vault:** private global memories at `~/mnemonic-vault` (its own git repo):

```
~/mnemonic-vault/
  .gitignore             ← auto-created, gitignores embeddings/ and projections/
  notes/
    setup-notes-a1b2c3.md
  embeddings/            ← local only, never committed
    setup-notes-a1b2c3.json
  projections/           ← local only, never committed
    setup-notes-a1b2c3.json
```

**Project vault:** project-specific memories committed into the project repo:

```
<git-root>/
  .mnemonic/
    .gitignore           ← auto-created, gitignores embeddings/ and projections/
    notes/
      auth-bug-fix-d4e5f6.md
    embeddings/          ← local only, never committed
      auth-bug-fix-d4e5f6.json
    projections/        ← local only, never committed
      auth-bug-fix-d4e5f6.json
```

### Routing

`cwd` sets project context; `scope` picks storage:

- `cwd` + `scope: "project"` _(default when `cwd` is present)_ → project vault (`.mnemonic/`)
- `cwd` + `scope: "global"` → main vault, with project association in frontmatter
- no `cwd` → main vault as a plain global memory

Use `set_project_memory_policy` to save per-project defaults:

- write scope (`project`, `global`, `ask`)
- consolidation mode (`supersedes`, `delete`)
- protected-branch behavior for project-vault writes (`ask`, `block`, `allow`)
- protected-branch patterns (glob strings; defaults are `main`, `master`, `release*`)

When write scope policy is `ask`, `remember` returns a clear storage choice instead of guessing. On supported MCP clients, it asks you to choose project or global storage through the client UI. When protected-branch behavior is `ask`, mutating tools that would commit to the project vault ask for one-time confirmation through the client UI. Clients without that support return the `allowProtectedBranch: true` override option and instructions for persisting `block` or `allow`.

### Project identity

Project identity derives from the **git remote URL**, normalized to a stable slug (e.g. `github-com-acme-myapp`). The same project is recognized consistently across machines regardless of local clone paths. The default remote is `origin`; use `set_project_identity` to switch to `upstream` for fork workflows. If no remote exists, the git root folder name is used; if not in a git repo, the directory name.

### Recall

`recall` with `cwd` searches both vaults. Project notes get a **small tiebreaker boost**. It is a soft signal, not a hard filter, so global memories remain accessible while project context floats to the top.

Every result carries structured quality signals to help agents decide what to trust:

- **`signalStrength`:** a composite score (0.00-0.50) from role, graph centrality, lifecycle, and recency. Higher values mean more structural support behind the note.
- **`confidence`:** a high, medium, or low tier derived from `signalStrength`, replacing a single coarse heuristic.
- **`diversity`:** the theme count, role mix, and lifecycle mix across selected results.
- **`retrievalCoverage`:** the fraction of high-priority anchors (alwaysLoad and summary notes) represented in results.

**Hybrid recall** combines semantic similarity, exact wording, and relationship context on every query. It can now find exact names, identifiers, phrases, error codes, and version strings even when they are not semantically similar, while still favoring conceptually relevant and well-connected notes. The ranking remains bounded and fail-soft, uses compact projections without new infrastructure, and preserves canonical explanation promotion and temporal recency hints.

Recall modes:

- `mode: "default"` (default): hybrid recall across semantic, lexical, and graph evidence with bounded relationship previews.
- `mode: "temporal"`: enrich top matches with compact git-backed history (no raw diffs by default).
- `mode: "workflow"`: prioritize RPIR-style chain reconstruction while remaining compatible with legacy `related-to` links.

Recall evidence:

- `evidence: "compact"` (optional recall): add compact retrieval rationale per result in text and structured output.
- `retrievalEvidence` includes stable abstractions such as `channels`, `rankBand`, `projectRelevant`, `freshness`, optional supersession hints (`supersededBy`, `supersededCount`), and score decomposition when available.
- Recall evidence defaults off; consolidate evidence defaults `true` for safety.

**What temporal mode shows:**

- **Per-change descriptions** (`changeDescription`): human-readable summaries like "Expanded the note with additional detail" or "Minor refinement to existing content."
- **Note-level history summaries** (`historySummary`): overall patterns like "The core decision remained stable while rationale and examples expanded." or "The note was connected to related work through incremental updates."
- **Semantic change categories**: create, refine, expand, clarify, connect, restructure, reverse, unknown

**How it works:**

mnemonic interprets change semantically using structural and statistical signals (size ratios, heading changes, and section movements) rather than language-dependent analysis. Raw diffs are intentionally NOT part of default temporal output. You get interpretive summaries that explain what kind of change happened, not patch noise.

Use `verbose: true` together with temporal mode when you want richer change stats such as additions, deletions, files changed, and change classification. Those stats describe the whole commit that touched the note, not a raw diff excerpt, so recall stays bounded and does not return full diffs.

The `scope` parameter on `recall` narrows results:

- `"all"` (default): project memories boosted, then global. When `scope` is omitted and `cwd` detects a project, recall applies project-anchored precision: semantic matches from unassociated global notes must be curated (`alwaysLoad`), strongly matching, or arrive via exact-wording lexical or graph-linked evidence to appear; the response reports any suppressed matches and a pass `scope: "all"` includes everything ungated. When no result is admitted at all, recall widens to the full pool and says so.
- `"project"`: only memories for the detected project (project-associated notes wherever stored, plus attached vault notes)
- `"global"`: memories in the main/global vault, which may include project-tagged personal notes (the "repo you don't own" case)

When `cwd` is omitted, only the global main vault is searched; `recall`, `list`, `recent_memories`, and `memory_graph` say so in their output, and `get`, `update`, `forget`, and `where_is_memory` mention it when an id cannot be found, so the caller can pass the project working directory.

### Note lifecycle

Each note carries a `lifecycle`:

- `"permanent"` (default): durable knowledge for future sessions
- `"temporary"`: working-state scaffolding (plans, WIP checkpoints) that can be cleaned up once consolidated

Store what should help future work: decisions, outcomes, corrections, constraints, and lessons learned. Leave routine chatter out. Cleanup stays explicit through lifecycle and consolidation choices; mnemonic does not auto-expire notes.

### Roles and lifecycle

Roles are optional prioritization hints, not required schema. mnemonic infers a `role` and `importance` from structural signals (heading count, bullet density, inbound references, and relationship types). Inference is language-independent and never overwrites explicit frontmatter. Valid roles: `summary`, `decision`, `plan`, `context`, `reference`, `research`, `review`. Valid importance values: `high`, `normal`, `low`.

Set `alwaysLoad: true` in a note's frontmatter to mark it as an explicit session anchor; it receives the highest recall and relationship-expansion priority regardless of inferred role.

mnemonic works without roles. Inferred roles stay internal-only, prioritization is language-independent by default, and lifecycle remains the separate durability axis. When `lifecycle` is omitted, `remember` applies soft defaults based on role: `research`, `plan`, and `review` default to `temporary`; `decision`, `summary`, and `reference` default to `permanent`. Explicit `lifecycle` always overrides the role-based default.

### RPIR workflow conventions

For structured workflows, use the RPIR stages: research -> plan -> implement -> review (iterate only when needed).

- Create one request root note per workflow: `role: context`, `lifecycle: temporary`, `tags: ["workflow", "request"]`.
- Keep one current plan note per request (`role: plan`) and update or supersede as the plan evolves.
- For apply/task notes, do not add a new role: use `role: plan` for executable steps and `role: context` for execution observations; tag both with `apply`.
- Keep relationships sparse and immediate-upstream only: research -> request, plan -> request/research, apply -> plan, review -> apply/plan, outcome -> plan (optionally request).
- Consolidate at workflow end: keep the durable outcome, preserve details that still matter, and explicitly remove temporary scaffolding when safe.

### Note format

Notes are standard markdown with YAML frontmatter:

```markdown
---
title: Auth bug fix approach
tags: [auth, bugfix]
project: github-com-acme-myapp
projectName: myapp
createdAt: 2026-03-07T10:00:00.000Z
updatedAt: 2026-03-07T10:00:00.000Z
---

We fixed the JWT expiry issue by switching to RS256 and...
```

Content is markdown-linted on `remember`/`update`: fixable issues are auto-corrected before save; non-fixable issues are rejected.

### Embeddings and projections

Embeddings are generated through the configured provider (`ollama`, `openai-compatible`, `openai`, or `gemini`), stored as local JSON alongside notes, and gitignored. The `sync` MCP tool backfills missing or stale embeddings on every run; call it with `{ "force": true }` to rebuild all embeddings after provider/model/dimension changes.

Embedding records include non-secret compatibility metadata so mnemonic can avoid comparing vectors from incompatible embedding spaces. Provider configuration itself remains environment-only.

**Projections** improve embedding quality by extracting structured representations instead of embedding raw markdown. Each note has a projection stored in `projections/<noteId>.json` (also gitignored) containing:

- `projectionText`: compact embedding input (max 1200 chars) with title, lifecycle, tags, summary, and h1 through h3 headings
- `summary`: extracted from the first non-heading paragraph, first bullet list, or first 200 chars of body
- `headings`: up to 8 deduplicated h1 through h3 headings (plain text, in order)
- `updatedAt`: staleness anchor matching the note's updatedAt timestamp

Projections are built lazily on first embed and rebuilt when `note.updatedAt !== projection.updatedAt`. No global rebuild is needed because staleness is timestamp-based. If projection generation fails, the system falls back to raw `title + content`, so embeds never block.

### Migrations

Each vault has its own `config.json` with a `schemaVersion`, so main and project vaults migrate independently:

- `list_migrations` reports schema version and pending migrations per vault.
- Startup warns when a vault is behind schema, but does not auto-migrate.
- `execute_migration` supports dry-run to preview changes before applying.
- Failed migration runs roll staged note writes back instead of leaving partial edits.
- Metadata-only migrations do not re-embed automatically; re-embedding happens on title/content change or during `sync` backfill.

The main vault `config.json` also controls mutation push behavior:

- `mutationPushMode: "main-only"` _(default)_ - auto-push main-vault mutations, but leave project-vault commits local until the user pushes or runs `sync`
- `mutationPushMode: "all"` - auto-push mutating writes in both vault types
- `mutationPushMode: "none"` - never auto-push mutating writes; use `sync` or manual git commands instead

This keeps unpublished project branches from failing on `remember`/`update`, while still letting the main vault stay in sync by default.

## CLI commands

mnemonic ships CLI commands in addition to the MCP server.

### `mnemonic migrate`

Apply pending schema migrations to your vaults. Always preview with `--dry-run` first.

```bash
# Preview what would change
mnemonic migrate --dry-run

# Apply and auto-commit
mnemonic migrate

# Limit to one project vault
mnemonic migrate --dry-run --cwd=/path/to/project
mnemonic migrate --cwd=/path/to/project

# List available migrations and pending count
mnemonic migrate --list
```

### `mnemonic import-claude-memory`

Import [Claude Code auto-memory](https://docs.anthropic.com/en/docs/claude-code/memory) into your vault. Claude Code stores per-project auto-memory at `~/.claude/projects/<encoded-path>/memory/*.md`. Each `##` heading becomes a separate mnemonic note tagged with `claude-memory` and `imported`. Notes whose titles already exist in the vault are skipped, so the command is safe to re-run.

```bash
# Preview what would be imported
mnemonic import-claude-memory --dry-run

# Import from the current directory's Claude memory
mnemonic import-claude-memory

# Import for a specific project path
mnemonic import-claude-memory --cwd=/path/to/project

# Use a non-default Claude home
mnemonic import-claude-memory --claude-home=/custom/.claude
```

Imported notes are written to the main vault with `lifecycle: permanent` and `scope: global`. After importing, ask your MCP client to run the `sync` tool to embed them and push to your remote.

## Prompts

| Prompt                   | Description                                                                                                                                                                                                                                              |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mnemonic-rpi-workflow`  | Optional. Returns RPIR stage protocol and conventions: request root note pattern, stage checklists, apply/task split, sparse relationships, subagent handoff contract, and commit discipline.                                                            |
| `mnemonic-workflow-hint` | Optional. Returns a compact decision protocol: recall/list first, inspect with `get`, update before remember, then organize. Reinforces summary-first orientation, attention-filter capture, evidence before consolidation, and lifecycle as durability. |

## Tools

| Tool                        | Description                                                                                                                                         |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `add_attachment`            | Add an external repository as a federated knowledge source. `kind: "mnemonic-vault"` (default) attaches another repo's notes; `kind: "document-source"` indexes its markdown read-only. See [Configuring attachments](#configuring-attachments) for worked examples.                                  |
| `consolidate`               | Merge and analyze overlapping notes; evidence defaults `true` for analysis strategies and execute-merge (lifecycle, risk, classification, warnings) |
| `detect_project`            | Resolve `cwd` to stable project id via git remote URL                                                                                               |
| `discover_tags`             | Suggest canonical tags for a note using title/content/query context; `mode: "browse"` opts into broader inventory output                            |
| `execute_migration`         | Execute a named migration (supports dry-run)                                                                                                        |
| `forget`                    | Delete note + embedding, git commit + push, cleanup relationships                                                                                   |
| `get`                       | Fetch one or more notes by exact id; `includeRelationships: true` adds bounded 1-hop previews. Also resolves `doc:` and `chunk:` retrieval handles for exact document content from indexed document-source attachments.                                                       |
| `get_project_identity`      | Show effective project identity and remote override                                                                                                 |
| `get_project_memory_policy` | Show saved write scope, consolidation mode, protected-branch settings, and `maxAttachmentsPerProject`                                               |
| `list`                      | List notes filtered by scope/tags/storage; `storedIn: "attached"` filters to attached-repo notes                                                    |
| `list_attachments`          | List all attached repositories for the current project with status                                                                                  |
| `list_migrations`           | List available migrations and pending count                                                                                                         |
| `memory_graph`              | Show compact adjacency list of relationships                                                                                                        |
| `move_memory`               | Move note between vaults without changing id                                                                                                        |
| `project_memory_summary`    | Session-start entrypoint: themes, anchors, orientation, maintenance warnings, and working-state recovery hints                                      |
| `recall`                    | Hybrid semantic, exact-wording, and relationship search with temporal/workflow modes and optional `evidence: "compact"` rationale. Returns `documentChunks` from document-source attachments alongside memory results.                   |
| `recent_memories`           | Show most recently updated notes for scope                                                                                                          |
| `remember`                  | Write note + embedding; `cwd` sets context, `scope` picks storage, `lifecycle` picks temporary vs permanent                                         |
| `relate`                    | Create typed relationship between notes (bidirectional)                                                                                             |
| `remove_attachment`         | Remove an attached repository by `projectSlug`                                                                                                      |
| `set_attachment_branch`     | Change the branch an attached repository reads from; requires `projectSlug` and `branch`                                                            |
| `set_attachment_enabled`    | Enable or disable an attached repository; requires `projectSlug` and `enabled`                                                                      |
| `set_project_identity`      | Save which git remote defines project identity                                                                                                      |
| `set_project_memory_policy` | Save project policy defaults (scope, consolidation mode, protected-branch behavior/patterns, `maxAttachmentsPerProject`)                            |
| `sync`                      | Git sync + embedding backfill + attached repo reconciliation; indexes document-source attachments from a pinned git revision; `force: true` rebuilds all embeddings                                                 |
| `unrelate`                  | Remove relationship between notes                                                                                                                   |
| `update`                    | Update note content/title/tags/lifecycle; re-embeds when content changes                                                                            |
| `where_is_memory`           | Show note's project association and storage location                                                                                                |

### Theme emergence

`project_memory_summary` categorizes notes by theme. Themes **emerge automatically** from your notes:

- **Tag-based classification:** notes with matching tags (for example, `["decisions"]` or `["bugs"]`) are grouped immediately.
- **Keyword graduation:** keywords that appear across multiple notes become named themes over time.
- **"other" bucket:** notes that do not match a theme are grouped here. This bucket shrinks as themes emerge.

No predefined schema required. The system adapts to your project's vocabulary.

**Language handling:** The system degrades gracefully for non-English notes. Stopwords and synonyms are optional English enhancements; keywords that don't match pass through unchanged, allowing non-English keywords to graduate if they meet frequency thresholds.

### Relationships

Notes can be linked with typed edges stored in frontmatter:

```yaml
relatedTo:
  - id: auth-bug-fix-a1b2c3d4
    type: related-to
  - id: security-policy-b5c6d7e8
    type: explains
```

| Type           | Meaning                                  |
| -------------- | ---------------------------------------- |
| `related-to`   | Generic association (default)            |
| `explains`     | `fromId` explains `toId`                 |
| `example-of`   | `fromId` is a concrete example of `toId` |
| `supersedes`   | `fromId` is the newer version of `toId`  |
| `derives-from` | `fromId` is derived from `toId`          |
| `follows`      | `fromId` follows `toId` in sequence      |

`workflow` recall mode prefers directional and typed relationships first, then falls back to `related-to` for long-term compatibility with older vaults.

`relate` is bidirectional by default. `forget` automatically removes any edges pointing at the deleted note.

### Multi-repository attachments

Multi-repo attachment support lets you link external repositories as **federated knowledge sources** alongside your own project vault. By default, attached repos are read-only; set `writable: true` on `add_attachment` to enable write-through.

Key concepts:

- `add_attachment` links a repo by its absolute `localPath` (supports `~` expansion); optional `branch`, `vaultFolder`, `writable`, and `pushBranch` select branch, sub-vault, write access, and push target. Use `kind: "document-source"` to index markdown files as read-only document retrieval sources.
- **Document-source attachments:** when `kind: "document-source"`, the attachment indexes markdown files from a pinned git revision. Documents are extracted, split by heading, and made searchable through recall. `get` resolves `doc:` and `chunk:` handles for exact content. Mutation tools reject document-source entities, so the source repository is never written to. Configuration accepts `root` (default `.`), `include` (default `["**/*.md"]`), `exclude` (defaults to generated/vendor paths), and `acceptedMediaTypes` (default `["text/markdown"]`). See [Configuring attachments](#configuring-attachments) for worked examples.
- `remove_attachment` removes by `projectSlug`; `list_attachments` shows all attachments with status.
- `set_attachment_enabled` toggles an attachment on/off without removing config; `set_attachment_branch` changes the branch.
- Max 5 attachments per project (configurable via `maxAttachmentsPerProject` in project memory policy).
- Storage label format: `attached:<slug>/.mnemonic`
- Use `storedIn: "attached"` on `list`, `recall`, or `where_is_memory` to audit attached-repo notes; `storedIn: "any"` includes all vaults.
- `sync` fetches attached repo branches and reconciles embeddings in the same call.
- **Writable attached vaults**: when `writable: true`, `remember`, `update`, `forget`, `relate`, `unrelate`, `consolidate`, and `move_memory` can modify notes in the attached vault; commits push to `pushBranch` (or the attachment's `branch` if omitted).
- **Cross-vault relationships**: notes in different vaults can be related; the `Relationship` type includes a `vaultPath` field for cross-vault traversal.
- If an attached repo or branch is unavailable, reads fail-soft and the rest of the session continues unaffected.

#### Configuring attachments

Attachments are configured through the `add_attachment` tool, which writes the config and activates the attachment. `cwd` and `localPath` are required; everything else is optional. Fields that do not apply to the chosen `kind` are ignored.

**Document-source:** index an external repository's markdown as read-only, searchable content:

```json
{
  "cwd": "/path/to/your/project",
  "localPath": "/path/to/external/repo",
  "kind": "document-source",
  "root": "docs",
  "include": ["**/*.md"],
  "exclude": ["**/CHANGELOG.md"]
}
```

| Parameter            | Default                                                              | Meaning                                                                        |
| -------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `kind`               | `"mnemonic-vault"`                                                  | `"document-source"` indexes repository markdown as read-only retrieval content |
| `root`               | `"."`                                                               | Repository-relative POSIX path to search; absolute paths and `..` are rejected  |
| `include`            | `["**/*.md"]`                                                       | Glob patterns relative to `root` for files to index                             |
| `exclude`            | `["node_modules", ".git", "dist", "build", ".next", ".cache", "coverage"]` | Glob patterns relative to `root` to skip; defaults cover generated/vendor paths |
| `acceptedMediaTypes` | `["text/markdown"]`                                                 | Canonical lower-case IANA base media types accepted as indexable sources        |

Only tracked Git blobs at the pinned revision are indexed. Symlinks, submodules, and untracked working-tree files are skipped. Matching is case-sensitive on Git tree paths: `**` crosses directories, `*` matches within a segment, and a bare name like `node_modules` matches any segment.

**Mnemonic-vault:** attach another repository's notes as a federated vault, optionally writable:

```json
{
  "cwd": "/path/to/your/project",
  "localPath": "/path/to/external/repo",
  "kind": "mnemonic-vault",
  "branch": "main",
  "writable": true,
  "pushBranch": "main"
}
```

| Parameter     | Default                | Meaning                                                                                                      |
| ------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| `kind`        | `"mnemonic-vault"`    | Managed mnemonic notes in the attached repository                                                             |
| `vaultFolder` | `".mnemonic"`         | Sub-folder holding the attached repo's notes                                                                  |
| `branch`      | auto-detected          | Branch to read notes from                                                                                     |
| `writable`    | `false`                | Allow `remember`, `update`, `forget`, `relate`, `unrelate`, `consolidate`, and `move_memory` in the attached vault |
| `pushBranch`  | attachment's `branch`  | Branch pushed to when `writable`                                                                              |

`root`, `include`, `exclude`, and `acceptedMediaTypes` apply only to `document-source`; `vaultFolder`, `writable`, and `pushBranch` apply only to `mnemonic-vault`.

**After attaching a document source**, call `sync` to pin the remote-tracking commit and build the index. Documents then surface in `recall` as `documentChunks` (project/all scope), and `get` resolves `doc:` / `chunk:` handles to exact content. Document-source entities are immutable: `update`, `forget`, `move_memory`, `relate`, `unrelate`, and `consolidate` return an immutable-document error.

See `AGENT.md` for the full tool descriptions and attachment architecture details.

## Multi-machine workflow

**Main vault:**

```bash
# First time on a new machine:
git clone git@github.com:you/mnemonic-vault.git ~/mnemonic-vault
# Then ask your agent to call the `sync` MCP tool — it pulls, pushes, and backfills embeddings in one step.
```

**Project vault:**

```bash
# Already in the project repo — clone the project as normal.
# The .mnemonic/ directory comes along with it.
# Ask your agent to call the `sync` MCP tool with the project cwd to pull/push and backfill embeddings.
```

After the first sync, call the `sync` MCP tool (with `cwd` for project vaults) whenever you switch machines. It handles pull, push, and embeddings in one shot.

## FAQ

**Is the advantage over plain markdown files and grep just easier search?**

Easier search is part of it, but three things work together:

- **Semantic search over vector embeddings.** Each note is indexed through your configured embedding provider, so `recall` can find the right note even when you do not remember the exact words. For example, searching "JWT expiry bug" can surface a note titled "RS256 migration rationale". `grep` only matches strings you already know.
- **A connected knowledge graph.** Notes link to each other with typed relationships (`explains`, `supersedes`, `example-of`). Related context surfaces together automatically; `memory_graph` shows the full web. A folder of markdown files has no edges between them.
- **Decision history travels with the code.** Every `remember`, `update`, and `consolidate` creates a descriptive git commit. Your decision log and implementation plans evolve alongside the code they describe, with attribution and timestamps in `git log`.

mnemonic is designed to be removable. If you stop using it, your notes remain plain markdown with standard YAML frontmatter. You can read them in any editor, search them with `grep`, and commit them to git.

**Are mnemonic's embeddings the same as what Claude uses?**

No. The embeddings here are **retrieval vectors** generated by the provider you configure. With the default Ollama provider, projection text stays on your machine. With OpenAI-compatible cloud proxies, native OpenAI, or Gemini, projection text is sent to that external endpoint. The resulting vectors are stored as local gitignored JSON files. This is the same idea as retrieval-augmented generation (RAG): each note is converted to a dense numeric vector so `recall` can find semantically related notes even when you don't remember the exact words you used. It has nothing to do with how Claude processes tokens internally.

**Why do project memories appear first in `recall` results even when global memories are more similar?**

When you call `recall` with `cwd`, mnemonic adds a small bounded project tiebreaker (**currently +0.005**) to notes belonging to the detected project. Recall also combines semantic similarity, exact wording, and relationship context, so global memories can still rank highly when they have stronger retrieval evidence.

**I want to brainstorm with no repo yet. Should I create a temp folder first?**

Usually, no. If you're talking to an LLM with mnemonic MCP configured, treat it like a normal brainstorming chat and ask it to store key points in the **main vault** (global memory).

Example conversation style:

```text
You: I have an idea for a meal-planning app. Let's brainstorm v1 scope.
LLM: Great. I can capture key decisions and open questions in global memory while we explore.

You: Please remember that the app should build weekly meals from pantry items, and avoid recipes with too many missing ingredients.
You: Also remember that I'm undecided on mobile-first vs web-first.
```

When the idea becomes a real repo, switch to that project context and ask the LLM to migrate only the notes that became project-specific.

```text
You: We're creating the repo now at /path/to/meal-planner.
You: Recall my earlier meal-planner brainstorm notes and move the implementation-relevant ones into this project's vault.
```

This keeps early ideation reusable as personal/global knowledge while moving concrete project context into `.mnemonic/` once collaboration and implementation begin.

**How does mnemonic differ from Beads?**

mnemonic and Beads address complementary concerns. mnemonic is a **knowledge graph**: it stores notes, relationships between them, and lets agents retrieve relevant context through semantic search. [Beads](https://github.com/steveyegge/beads) is a **task and dependency tracker**: it models work items and their dependencies so agents can determine what is ready to execute next. Both tools can coexist in the same workflow. mnemonic stores knowledge and reasoning while Beads manages execution.

**How does mnemonic differ from Memory Bank MCP?**

mnemonic and Memory Bank MCP both provide persistent memory for agents, but differ in hosting and scope. Memory Bank MCP is a **centralized service**. Your memory lives in a remote MCP service and is accessed across projects through that endpoint. mnemonic is **local-first**. Your memories live as plain markdown files on your machine: project-scoped notes in `.mnemonic/` within each repo, and personal notes in a global vault under your home directory. There is no always-on server to configure or depend on. The MCP server spawns on demand per session.

**How does mnemonic differ from Basic Memory?**

Both tools are local-first and use markdown, but with different scoping models. [Basic Memory](https://github.com/basicmachines-co/basic-memory) maintains a **knowledge base per project** that agents can search and update, with optional cloud sync. mnemonic splits memory into **two distinct vaults**: a global personal vault (`~/mnemonic-vault/`) for cross-project knowledge, and a project-scoped vault (`.mnemonic/`) that travels with the repo and is shared via git. This lets you capture early ideas globally before a repo exists, then migrate only project-relevant notes into the shared vault once collaboration begins.

**What are temporary notes?**

mnemonic distinguishes between two lifecycle states. `temporary` notes capture evolving working-state: hypotheses, in-progress plans, experiment results, draft reasoning. `permanent` notes capture durable knowledge: decisions, root cause explanations, architectural guidance, lessons learned. As an investigation progresses, a cluster of temporary notes is typically `consolidate`d into one or more permanent notes, and the scaffolding is discarded. Consolidation should keep the useful outcome without flattening away details future work may need. This two-phase lifecycle keeps exploratory thinking from polluting long-term memory while still giving agents a place to reason incrementally before committing to a conclusion.

Roles, when present, are separate from lifecycle: they help prioritization and retrieval, not retention policy. mnemonic still works without roles, and any inferred role metadata remains an internal hint rather than part of the user-facing note contract.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for development setup, dogfooding workflow, testing requirements, and pull request guidelines.

## Repository layout

```
src/       TypeScript runtime code
tests/     Vitest test files
build/     Compiled JavaScript output
.mnemonic/ Project-scoped memories for this repo
```

## Agent instructions

See [SYSTEM_PROMPT.md](SYSTEM_PROMPT.md) for the recommended agent instructions.
