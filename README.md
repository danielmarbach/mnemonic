# mnemonic

A local MCP memory server backed by plain markdown files, synced via git. No database. Project-scoped memory with semantic search.

For the high-level system map, see [`ARCHITECTURE.md`](ARCHITECTURE.md). For release notes, see [`CHANGELOG.md`](CHANGELOG.md).

## Why mnemonic

- 🧠 Your MCP client remembers decisions, fixes, and context across sessions — no re-explaining the same project.
- 📁 Memories are plain markdown with YAML frontmatter: readable, diffable, mergeable, and easy to back up.
- 🚫 No database or always-on service: just files, git, and a local Node process.
- 🎯 Project-scoped recall surfaces the right repo context first while keeping global memories accessible.
- 🤝 Shared `.mnemonic/` notes travel with the repository, so project knowledge isn't trapped in one person's chat history.
- 🔒 Embeddings stay local and gitignored — semantic search without committing generated vector data.
- 📝 Every `remember`, `update`, and `consolidate` creates a semantic git commit — decision log and plans travel with the code in the same history.
- 🔓 Designed for removability — though we're quietly confident you won't use that exit. Every note is plain markdown with YAML frontmatter; the knowledge you gather is independent of mnemonic and always yours.

## Stability

mnemonic is at the inception stage. The storage format (frontmatter schema, vault layout, config structure) is still stabilizing and **may change in breaking ways** between releases. Migrations are provided when possible, but treat your vault as something you can afford to rebuild or re-migrate during this period. Keep an eye on the changelog; mnemonic surfaces pending migrations at startup and `list_migrations` shows pending work per vault after each update.

**Scale:** Designed for simplicity and portability — not large-scale knowledge bases.

- Hundreds to low thousands of notes: excellent fit.
- Several thousand: often fine, depending on note size, machine speed, and embedding throughput.
- Very large collections: expect pain points around reindex time, recall latency, and git churn.
- Many concurrent writers or massive scale: consider a dedicated database and indexing layer instead.

## Prerequisites

[Ollama](https://ollama.com) must be running locally with an embedding model pulled:

```bash
ollama pull nomic-embed-text-v2-moe
```

`qwen3-embedding:0.6b` is an alternative with a larger context window for longer notes:

```bash
ollama pull qwen3-embedding:0.6b
```

No code changes required — set `EMBED_MODEL=qwen3-embedding:0.6b` in your environment or MCP config.

## Setup

### Native (Node.js 18+)

```bash
npm install
npm run build
npm test
```

`npm run build` already runs `typecheck`, but running it explicitly first gives a faster failure loop when iterating on the codebase.

For local dogfooding, start the built MCP server with:

```bash
npm run mcp:local
```

This rebuilds first, then launches `build/index.js`, so MCP clients always point at the latest source.

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

## Installing from npm

Packages are published to the public npm registry. No authentication required.

```bash
# Latest stable release
npm install @danielmarbach/mnemonic-mcp

# Specific release
npm install @danielmarbach/mnemonic-mcp@0.2.0
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

| Variable      | Default                   | Description                      |
|---------------|---------------------------|----------------------------------|
| `VAULT_PATH`  | `~/mnemonic-vault`        | Path to your markdown vault      |
| `OLLAMA_URL`  | `http://localhost:11434`  | Ollama server URL                |
| `EMBED_MODEL` | `nomic-embed-text-v2-moe` | Ollama embedding model           |
| `DISABLE_GIT` | `false`                   | Set `true` to skip all git ops   |

### config.json

The main vault's `~/mnemonic-vault/config.json` holds machine-local settings that survive across sessions. You can edit it by hand — unknown fields are ignored and invalid values fall back to defaults.

User-tunable fields:

| Field | Default | Description |
|-------|---------|-------------|
| `reindexEmbedConcurrency` | `4` | Parallel embedding requests during `sync` (capped 1–16) |
| `mutationPushMode` | `"main-only"` | When to auto-push after a write: `"all"`, `"main-only"`, or `"none"` |

`projectMemoryPolicies` and `projectIdentityOverrides` are written automatically by `set_project_memory_policy` and `set_project_identity` — no need to edit them by hand.

Example — raise concurrency on a fast machine and disable auto-push everywhere:

```json
{
  "reindexEmbedConcurrency": 8,
  "mutationPushMode": "none"
}
```

## How it works

### Vault layout

Two vault types store notes:

**Main vault** — private global memories at `~/mnemonic-vault` (its own git repo):

```
~/mnemonic-vault/
  .gitignore             ← auto-created, gitignores embeddings/
  notes/
    setup-notes-a1b2c3.md
  embeddings/            ← local only, never committed
    setup-notes-a1b2c3.json
```

**Project vault** — project-specific memories committed into the project repo:

```
<git-root>/
  .mnemonic/
    .gitignore           ← auto-created, gitignores embeddings/
    notes/
      auth-bug-fix-d4e5f6.md
    embeddings/          ← local only, never committed
      auth-bug-fix-d4e5f6.json
```

### Routing

`cwd` sets project context; `scope` picks storage:

- `cwd` + `scope: "project"` *(default when `cwd` is present)* → project vault (`.mnemonic/`)
- `cwd` + `scope: "global"` → main vault, with project association in frontmatter
- no `cwd` → main vault as a plain global memory

Use `set_project_memory_policy` to save a per-project default. Supported values: `project`, `global`, `ask`. When policy is `ask`, `remember` returns a clear choice instead of guessing.

### Project identity

Project identity derives from the **git remote URL**, normalized to a stable slug (e.g. `github-com-acme-myapp`). The same project is recognized consistently across machines regardless of local clone paths. The default remote is `origin`; use `set_project_identity` to switch to `upstream` for fork workflows. If no remote exists, the git root folder name is used; if not in a git repo, the directory name.

### Recall

`recall` with `cwd` searches both vaults. Project notes get a **+0.15 similarity boost** — a soft signal, not a hard filter — so global memories remain accessible while project context floats to the top.

The `scope` parameter on `recall` narrows results:

- `"all"` *(default)* — project memories boosted, then global
- `"project"` — only memories for the detected project
- `"global"` — only memories with no project association

### Note lifecycle

Each note carries a `lifecycle`:

- `"permanent"` *(default)* — durable knowledge for future sessions
- `"temporary"` — working-state scaffolding (plans, WIP checkpoints) that can be cleaned up once consolidated

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

### Embeddings and migrations

Embeddings are generated by Ollama's `/api/embed` with truncation enabled, stored as local JSON alongside notes, and gitignored. `sync` backfills missing embeddings on every run; `sync { force: true }` rebuilds all.

Each vault has its own `config.json` with a `schemaVersion`, so main and project vaults migrate independently:

- `list_migrations` reports schema version and pending migrations per vault.
- Startup warns when a vault is behind schema, but does not auto-migrate.
- `execute_migration` supports dry-run to preview changes before applying.
- Failed migration runs roll staged note writes back instead of leaving partial edits.
- Metadata-only migrations do not re-embed automatically; re-embedding happens on title/content change or during `sync` backfill.

The main vault `config.json` also controls mutation push behavior:

- `mutationPushMode: "main-only"` *(default)* - auto-push main-vault mutations, but leave project-vault commits local until the user pushes or runs `sync`
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

Imported notes are written to the main vault with `lifecycle: permanent` and `scope: global`. After importing, run `sync` to embed them and push to your remote.

## Tools

| Tool                        | Description                                                              |
|-----------------------------|--------------------------------------------------------------------------|
| `consolidate`               | Merge multiple notes into one with relationship to sources               |
| `detect_project`            | Resolve `cwd` to stable project id via git remote URL                   |
| `execute_migration`         | Execute a named migration (supports dry-run)                             |
| `forget`                    | Delete note + embedding, git commit + push, cleanup relationships        |
| `get`                       | Fetch one or more notes by exact id                                      |
| `get_project_identity`      | Show effective project identity and remote override                      |
| `get_project_memory_policy` | Show saved default write scope                                           |
| `list`                      | List notes filtered by scope/tags/storage                                |
| `list_migrations`           | List available migrations and pending count                              |
| `memory_graph`              | Show compact adjacency list of relationships                             |
| `move_memory`               | Move note between vaults without changing id                             |
| `project_memory_summary`    | Summarize what mnemonic knows about a project                            |
| `recall`                    | Semantic search with optional project boost                              |
| `recent_memories`           | Show most recently updated notes for scope                               |
| `remember`                  | Write note + embedding; `cwd` sets context, `scope` picks storage, `lifecycle` picks temporary vs permanent |
| `relate`                    | Create typed relationship between notes (bidirectional)                  |
| `set_project_identity`      | Save which git remote defines project identity                           |
| `set_project_memory_policy` | Save default write scope for project (`project`, `global`, `ask`)       |
| `sync`                      | Git sync when remote exists plus embedding backfill always; `force=true` rebuilds all embeddings |
| `unrelate`                  | Remove relationship between notes                                        |
| `update`                    | Update note content/title/tags/lifecycle, re-embeds always               |
| `where_is_memory`           | Show note's project association and storage location                     |

### Relationships

Notes can be linked with typed edges stored in frontmatter:

```yaml
relatedTo:
  - id: auth-bug-fix-a1b2c3d4
    type: related-to
  - id: security-policy-b5c6d7e8
    type: explains
```

| Type         | Meaning                                  |
|--------------|------------------------------------------|
| `related-to` | Generic association (default)            |
| `explains`   | `fromId` explains `toId`                 |
| `example-of` | `fromId` is a concrete example of `toId` |
| `supersedes` | `fromId` is the newer version of `toId`  |

`relate` is bidirectional by default. `forget` automatically removes any edges pointing at the deleted note.

## Multi-machine workflow

**Main vault:**

```bash
# First time on a new machine:
git clone git@github.com:you/mnemonic-vault.git ~/mnemonic-vault
# Then ask Claude to run `sync` — it pulls, pushes, and backfills embeddings in one step.
```

**Project vault:**

```bash
# Already in the project repo — clone the project as normal.
# The .mnemonic/ directory comes along with it.
# Ask Claude to run `sync` with the project cwd to pull/push and backfill embeddings.
```

After the first sync, call `sync` (with `cwd` for project vaults) whenever you switch machines. It handles pull, push, and embeddings in one shot.

## FAQ

**Is the advantage over plain markdown files and grep just easier search?**

Easier search is part of it, but three things work together:

- **Semantic search over vector embeddings.** Each note is locally indexed via Ollama so `recall` finds the right note even when you don't remember the exact words — searching "JWT expiry bug" can surface a note titled "RS256 migration rationale". `grep` only matches strings you already know.
- **A connected knowledge graph.** Notes link to each other with typed relationships (`explains`, `supersedes`, `example-of`). Related context surfaces together automatically; `memory_graph` shows the full web. A folder of markdown files has no edges between them.
- **Decision history travels with the code.** Every `remember`, `update`, and `consolidate` creates a descriptive git commit, so your decision log and implementation plans evolve alongside the code they describe — attributed and timestamped in `git log`.

mnemonic is designed to be removable — so give it a try with confidence. We think once you do, you'll stay. But if you ever leave, all the knowledge you've gathered is independent: plain markdown with standard YAML frontmatter, readable in any editor, searchable with `grep`, committable to git. No rescue operation required.

**Are mnemonic's embeddings the same as what Claude uses?**

No. The embeddings here are **local vector representations** generated by Ollama on your machine — nothing is sent to Anthropic or any cloud service. They are produced by a small embedding model (`nomic-embed-text-v2-moe` by default) and stored as plain JSON files. This is the same idea as retrieval-augmented generation (RAG): each note is converted to a dense numeric vector so `recall` can find semantically related notes even when you don't remember the exact words you used. It has nothing to do with how Claude processes tokens internally.

**Why do project memories appear first in `recall` results even when global memories are more similar?**

When you call `recall` with `cwd`, mnemonic adds a fixed **+0.15 boost** to the cosine similarity score of every note belonging to the detected project. This is a soft boost, not a hard filter — global memories are still included when relevant. The boost ensures project-specific context floats to the top when you're working inside a repo while cross-project knowledge remains accessible further down the list.

**How does mnemonic differ from Beads?**

mnemonic and Beads address complementary concerns. mnemonic is a **knowledge graph**: it stores notes, relationships between them, and lets agents retrieve relevant context through semantic search. [Beads](https://github.com/steveyegge/beads) is a **task and dependency tracker**: it models work items and their dependencies so agents can determine what is ready to execute next. Both tools can coexist in the same workflow — mnemonic stores knowledge and reasoning while Beads manages execution.

**What are temporary notes?**

mnemonic distinguishes between two lifecycle states. `temporary` notes capture evolving working-state: hypotheses, in-progress plans, experiment results, draft reasoning. `permanent` notes capture durable knowledge: decisions, root cause explanations, architectural guidance, lessons learned. As an investigation progresses, a cluster of temporary notes is typically `consolidate`d into one or more permanent notes, and the scaffolding is discarded. This two-phase lifecycle keeps exploratory thinking from polluting long-term memory while still giving agents a place to reason incrementally before committing to a conclusion.

## Repository layout

```
src/       TypeScript runtime code
tests/     Vitest test files
build/     Compiled JavaScript output
.mnemonic/ Project-scoped memories for this repo
```

## Agent instructions

See [`SYSTEM_PROMPT.md`](SYSTEM_PROMPT.md) for the system prompt to use with your MCP client.
