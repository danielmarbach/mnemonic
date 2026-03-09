# mnemonic

A local MCP memory server backed by plain markdown + JSON files, synced via git. No database. Project-scoped memory with semantic search.

If you want the higher-level system map, see [`ARCHITECTURE.md`](ARCHITECTURE.md). For release notes and migration-facing changes, see [`CHANGELOG.md`](CHANGELOG.md).

## Why you might care

- 🧠 Your MCP client remembers decisions, fixes, and context across sessions instead of making you re-explain the same project over and over.
- 📁 Memories stay as plain markdown files in git, so they are easy to inspect, diff, back up, and move between machines.
- 🚫 No heavy database to run or babysit: it works with files, git, and a local Node process.
- 🎯 Project-scoped recall brings the right repo context to the top while still keeping useful global memories available.
- 🤝 Shared `.mnemonic/` notes let project knowledge travel with the repository instead of staying trapped in one person's chat history.
- 🔒 Embeddings stay local and disposable, so you keep the useful semantic search without committing generated vector data.
- ✨ It even stores linted markdown, because apparently your long-term memory should have better formatting discipline than most meeting notes.

## For the technical reader

- 📝 If you like markdown-first tools, this keeps memory as normal files with YAML frontmatter instead of hiding it in a database.
- 🪶 There is no Postgres or always-on service in the middle, which keeps setup light and makes the whole system easier to reason about.
- 🌿 Git stays part of the workflow: notes diff cleanly, merge conflicts stay local to one memory, and history remains inspectable.
- ⚙️ Generated embeddings are separate from source memories, so the repo only tracks the human-meaningful content.
- 🧩 The storage model is boring on purpose: one note per file, easy scripting, easy backup, easy migration.

## Early stage — storage format may change

mnemonic is at the inception stage. The storage format (note frontmatter schema, vault layout, config structure) is still stabilizing and **may change in breaking ways** between releases. Migrations are provided when possible, but you should treat your vault as something you can afford to rebuild or re-migrate during this period.

If you adopt it now, keep an eye on the changelog. mnemonic surfaces pending migrations at startup, and `list_migrations` shows pending work per vault after each update.

## Important caveat

This is optimized for simplicity, portability, and personal or small-team memory - not for huge-scale knowledge bases.

- ✅ Great fit for hundreds to low thousands of memories.
- 👍 Often still reasonable for several thousand, depending on note size, machine speed, and embedding throughput.
- ⚠️ Once you get into very large collections, the likely pain points are reindex time, recall latency, git repo churn, and general filesystem ergonomics.
- 🏗️ If you need massive scale or many concurrent writers, you probably want a different architecture with a dedicated database and indexing layer.

## Repository layout

```text
src/       TypeScript runtime code
tests/     Vitest test files
build/     Compiled JavaScript output
.mnemonic/ Project-scoped memories for this repo
```

## How it works

There are two kinds of vault:

**Main vault** — private global memories, stored in `~/mnemonic-vault` (its own git repo):
```
~/mnemonic-vault/
  .gitignore             ← auto-created, gitignores embeddings/
  notes/
    setup-notes-a1b2c3.md          ← global memory (no project)
  embeddings/                      ← local only, never committed
    setup-notes-a1b2c3.json
```

**Project vault** — project-specific memories committed directly into the project repo:
```
<git-root>/
  .mnemonic/
    .gitignore           ← auto-created, gitignores embeddings/
    notes/
      auth-bug-fix-d4e5f6.md       ← project memory, versioned with the project
    embeddings/          ← local only, never committed
      auth-bug-fix-d4e5f6.json
```

When you call `remember`, `cwd` determines project context and `scope` determines storage:

- `cwd` + `scope: "project"` *(default when `cwd` is present)* -> store in the project vault (`.mnemonic/`)
- `cwd` + `scope: "global"` -> store in the main vault while keeping the project association in frontmatter
- no `cwd` -> store in the main vault as a normal global memory

Rule of thumb: if the note is about the current repo, always pass `cwd` even when you want private storage in the main vault. Omitting `cwd` means "this is global and not tied to a project."

You can also set a per-project default once with `set_project_memory_policy`. After that, `remember` uses the saved default whenever `scope` is omitted. Supported defaults are `project`, `global`, and `ask`.

Notes are plain markdown with YAML frontmatter — readable, diffable, mergeable.
Each note also carries a `lifecycle` of `temporary` or `permanent`: use `temporary` for working-state scaffolding such as plans and WIP checkpoints, and `permanent` for durable knowledge you want future sessions to keep.
Memory content is markdown-linted on `remember`/`update`: fixable issues are auto-corrected before save, and non-fixable issues are rejected.
Embeddings stay local (gitignored) and are rebuilt on each machine with `reindex`.
Mnemonic uses Ollama's `/api/embed` endpoint with truncation enabled so longer notes still embed safely with `nomic-embed-text-v2-moe`.

Each vault has its own `config.json` with a `schemaVersion`, so main and project vaults can migrate independently. The main vault config in `~/mnemonic-vault/config.json` also holds machine-local runtime tuning, per-project memory policies, and optional project-identity remote overrides for fork workflows. Today it includes `reindexEmbedConcurrency`, which defaults to `4` and is clamped to the range `1..16`.

## Migration behavior

- `list_migrations` reports schema version and pending migrations per vault.
- Startup warns when a loaded vault is behind, but does not auto-run migrations.
- `execute_migration` and `mnemonic migrate --dry-run` let you preview changes before applying them.
- Non-dry-run migrations update a vault's schema only after the full vault run succeeds.
- Failed migration runs roll staged note writes back instead of leaving partial note edits in the working tree.
- Metadata-only migrations do not re-embed notes automatically; embeddings are only recomputed when title/content changes or when you run `reindex`.

If you maintain mnemonic itself and add a new latest-schema migration, bump `defaultConfig.schemaVersion` in `src/config.ts` in the same change so fresh installs start at the current schema.

## Project scoping

Project identity is derived from the **git remote URL** of the working directory, normalized to a stable slug (e.g. `github-com-acme-myapp`). This means the same project is recognized consistently across machines, regardless of local clone paths.

By default mnemonic uses the `origin` remote. If you are working in a fork and want mnemonic to follow the upstream project identity instead, use `set_project_identity` with `remoteName: "upstream"`. `get_project_identity` shows the effective identity and whether an override is active.

If no remote is configured, the git root folder name is used. If not in a git repo at all, the directory name is used.

When `recall` is called with a `cwd`, it searches both the project vault and the main vault. Project memories are **boosted by +0.15 similarity score** and appear first in results, followed by relevant global memories. You get project-specific context without losing access to cross-project knowledge.

## Prerequisites

- [Ollama](https://ollama.com) running locally with `nomic-embed-text-v2-moe` pulled:
```bash
ollama pull nomic-embed-text-v2-moe
```

`qwen3-embedding:0.6b` is also a viable alternative if you want a larger context window for longer notes:
```bash
ollama pull qwen3-embedding:0.6b
```
No code changes are required; set `EMBED_MODEL=qwen3-embedding:0.6b` in your environment or MCP config.

## Setup

### Native (Node.js 18+)

```bash
npm install
npm run typecheck
npm run build
npm test
```

`npm run build` already runs `typecheck`, but calling it explicitly first gives a faster failure loop when you're working on the codebase.

For local dogfooding, start the built MCP server with:

```bash
npm run mcp:local
```

That helper rebuilds first, then launches `build/index.js`, so local MCP clients can always point at the latest project code.

### Docker

```bash
docker compose build
docker compose up ollama-init  # pulls nomic-embed-text-v2-moe into the ollama volume (one-time)
```

Ollama runs as a container with a named volume (`ollama-data`) so downloaded models persist across restarts. An `ollama-init` service pulls `nomic-embed-text-v2-moe` on first run; `mnemonic` waits for it to complete before starting.

The vault directory (`~/mnemonic-vault` by default) is bind-mounted from the host, so notes and the git repo stay on your machine.

Override the vault location with an environment variable:

```bash
VAULT_PATH=/path/to/your-vault docker compose run --rm mnemonic
```

Git credentials (`~/.gitconfig` and `~/.ssh`) are mounted read-only so push/pull work inside the container.

## Installing from GitHub Packages

Staging builds are published to GitHub Packages under the `staging` dist-tag.

To install from GitHub Packages outside GitHub Actions, use a GitHub token with at least the `read:packages` scope.

Create an `.npmrc` in the consuming project (or in your home directory) with your GitHub username scope and a token that can read packages:

```ini
@danielmarbach:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN
```

Then install the latest staging build with:

```bash
npm install @danielmarbach/mnemonic-mcp@staging
```

For a specific prerelease, install the full version instead, for example:

```bash
npm install @danielmarbach/mnemonic-mcp@0.1.0-staging.12
```

Stable releases are published from git tags like `v0.1.0` and can be installed by exact version:

```bash
npm install @danielmarbach/mnemonic-mcp@0.1.0
```

## Running the MCP from an installed package

After installing the package, the MCP server can be launched through the published CLI binary.

**With `npx`:**
```bash
npx @danielmarbach/mnemonic-mcp@staging
```

**With a project-local install:**
```json
{
  "mcpServers": {
    "mnemonic": {
      "command": "npx",
      "args": ["@danielmarbach/mnemonic-mcp@staging"],
      "env": {
        "VAULT_PATH": "/Users/you/mnemonic-vault"
      }
    }
  }
}
```

If you prefer a fixed installed version, point your MCP client at the local binary instead:

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

## Configuration

| Variable      | Default                  | Description                        |
|---------------|--------------------------|------------------------------------|
| `VAULT_PATH`  | `~/mnemonic-vault`       | Path to your markdown vault        |
| `OLLAMA_URL`  | `http://localhost:11434` | Ollama server URL                  |
| `EMBED_MODEL` | `nomic-embed-text-v2-moe` | Ollama embedding model            |
| `DISABLE_GIT` | `false`                  | Set `true` to skip all git ops     |

The runtime is compatible with other Ollama embedding models that support `/api/embed`. For example, `qwen3-embedding:0.6b` works as a drop-in `EMBED_MODEL` override and may be preferable for longer-context notes.

## Claude Desktop / Cursor config

**Native:**
```json
{
  "mcpServers": {
    "mnemonic": {
      "command": "npx",
      "args": ["@danielmarbach/mnemonic-mcp@staging"],
      "env": {
        "VAULT_PATH": "/Users/you/mnemonic-vault"
      }
    }
  }
}
```

For local development against this repository's current source tree, use `npm run mcp:local` or point your MCP client at `scripts/mcp-local.sh` instead.

**Docker:**
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

## Tools

| Tool             | Description                                                                     |
|------------------|---------------------------------------------------------------------------------|
| `consolidate`    | Analyze and consolidate memories — detect duplicates, suggest merges, execute with `supersedes` (default) or `delete` mode |
| `detect_project` | Identify the project for a given `cwd` (`origin` by default, overrideable)     |
| `execute_migration` | Execute a named migration on vault notes (supports dry-run)                 |
| `forget`         | Delete a memory by id; cleans up dangling relationships automatically           |
| `get`            | Fetch one or more memories by exact id                                          |
| `get_project_identity` | Show the effective project identity and any remote override            |
| `get_project_memory_policy` | Show the saved default write scope for a project                    |
| `list`           | List memories — filter by project scope/tags and optionally include previews, relations, storage, and timestamps |
| `list_migrations` | List available migrations and show which ones are pending                   |
| `memory_graph`   | Show a compact adjacency list of memory relationships                           |
| `move_memory`    | Move a memory between `main-vault` and `project-vault`; moving into a project vault rewrites project association from `cwd`, moving out preserves it |
| `project_memory_summary` | Summarize what mnemonic knows about the current project                 |
| `recall`         | Semantic search — project-boosted when `cwd` provided                           |
| `recent_memories` | Show the most recently updated memories for a scope                            |
| `reindex`        | Manually rebuild missing embeddings (sync does this automatically)              |
| `relate`         | Create a typed relationship between two memories (bidirectional by default)     |
| `remember`       | Store a memory with project context from `cwd`, storage controlled by `scope`, and retention controlled by `lifecycle` |
| `set_project_identity` | Override which git remote defines project identity for a repo       |
| `set_project_memory_policy` | Set the default write scope and consolidation mode for a project |
| `sync`           | Bidirectional sync — pulls remote, pushes local commits, auto-embeds new notes  |
| `unrelate`       | Remove a relationship between two memories                                      |
| `update`         | Update content, title, tags, or lifecycle; `cwd` helps locate project notes     |
| `where_is_memory` | Show a memory's project association and actual storage location                |

## Relationships

Memories can be linked with typed edges stored in frontmatter:

```yaml
relatedTo:
  - id: auth-bug-fix-a1b2c3d4
    type: related-to
  - id: security-policy-b5c6d7e8
    type: explains
```

Relationship types:

| Type          | Meaning                                      |
|---------------|----------------------------------------------|
| `related-to`  | Generic association (default)                |
| `explains`    | `fromId` explains `toId`                     |
| `example-of`  | `fromId` is a concrete example of `toId`     |
| `supersedes`  | `fromId` is the newer version of `toId`      |

`relate` is bidirectional by default — both notes get the edge. `forget` automatically removes any edges that pointed at the deleted note.

## Recall scopes

`recall` accepts a search `scope` parameter:

- `"all"` *(default)* — project memories boosted, then global
- `"project"` — only memories for the detected project
- `"global"` — only memories with no project association

`remember` also accepts a write `scope` parameter, but there it means storage location:

- `"project"` — store in the shared project vault
- `"global"` — store in the private main vault

`remember` also accepts a `lifecycle` parameter:

- `"temporary"` — planning or WIP notes that mainly support the current implementation and should usually be deleted once consolidated
- `"permanent"` — durable knowledge worth keeping for future sessions

If omitted, `lifecycle` defaults to `"permanent"`.

If a project memory policy exists, omitting `scope` uses that policy first.

If the project policy is `ask`, `remember` returns a clear choice instead of guessing:

- `scope: "project"` — shared project vault (`.mnemonic/`)
- `scope: "global"` — private main vault with project association

## Project introspection

To see what mnemonic currently knows about a project without stitching together multiple calls:

- `project_memory_summary` — compact overview of project memories, grouped by theme, with current write policy and recent changes
- `get_project_identity` — show the effective project id and any fork/upstream remote override
- `recent_memories` — latest updated memories for the selected scope
- `memory_graph` — compact relationship view for visible memories
- `list` with `includePreview`, `includeRelations`, `includeStorage`, `includeUpdated`, and `storedIn` for richer inspection in one call
- `where_is_memory` — answer "which project does this belong to?" and "where is it actually stored?"
- `move_memory` — explicitly move a memory between the project vault and the main vault when the storage choice changes

`detect_project` also includes the current per-project write policy and any active project-identity override when one exists.

## Multi-machine workflow

**Main vault** (global memories):
```bash
# Machine B (first time):
git clone git@github.com:you/mnemonic-vault.git ~/mnemonic-vault
# Then ask Claude to run the `sync` tool — it pulls, pushes, and auto-embeds in one step
```

**Project vault** (project memories):
```bash
# Already in the project repo — just clone the project as normal.
# The .mnemonic/ directory comes along with it.
# Ask Claude to run `reindex` with the project cwd to build local embeddings.
```

After the first sync, just call `sync` (with `cwd` for project vaults) whenever you switch machines. It handles pull, push, and embedding in one shot — no separate `reindex` needed.

## Note format

Each note is standard markdown with YAML frontmatter:

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

## Agent instructions (system prompt)

Copy this into your `AGENT.md`, Cursor rules, or system prompt:

```
## Mnemonic Memory System

You have access to a long-term memory system via the `mnemonic` MCP server.
Use it proactively — don't wait to be asked.

### On every session start (in a project)
1. Call `detect_project` with the working directory and keep that absolute `cwd` for all project-specific memory operations.
2. Call `project_memory_summary` with `cwd` for a rich overview of what's known, or
   `recall` with a broad query like "project overview architecture decisions" — to
   surface relevant prior context before doing any work.
3. If the user mentions something you don't recognize, call `recall` before asking
   them to explain — you may already know it.

### Before calling `remember`
Do a quick `recall` first. If a related note exists, call `update` instead — this avoids
accumulating fragmented notes on the same topic. When several related captures pile up,
use `consolidate` to merge them into one authoritative note.

Pass `cwd` for anything about the current repo, even if you plan to store it with
`scope: "global"`. `cwd` sets project association; omitting it creates a truly global note.

### Choosing note lifecycle
When calling `remember`, set lifecycle based on whether the note is temporary working state or durable knowledge:

- `temporary`: planning or WIP notes that mainly support the current implementation and will likely be obsolete once the work is complete
- `permanent`: decisions, constraints, fixes, lessons, and other knowledge worth keeping for future sessions
- If unsure, choose `permanent`
- Tags like `plan`, `wip`, and `completed` are descriptive only; lifecycle controls retention behavior

### When to call `remember`
Store a memory whenever you learn something useful to know in a future session:

- **Decisions made**: architecture choices, library selections, rejected
  approaches and why ("we chose X over Y because Z")
- **User preferences**: coding style, communication style, tools they like/dislike
- **Project context**: what the project does, who it's for, current priorities
- **Bug fixes**: non-obvious fixes, especially ones that explain *why* something broke
- **Tribal knowledge**: anything the user had to explain that isn't obvious from the codebase
- **Recurring patterns**: if the user corrects you twice on the same thing, remember it

When in doubt, store it. Storage is cheap; re-explaining context is expensive.

**Writing good `remember` calls:**
- Use the `summary` parameter: provide a brief, commit-message-style summary (50-72 chars recommended)
  - Good: "Add JWT RS256 migration decision for distributed auth"
  - Bad: "stuff about auth" or "as discussed"
- The summary appears in git commits for traceability, but isn't stored in the note
- First sentence of content is used as fallback if no summary provided
- Write memory content summary-first: put the main fact, decision, or outcome in the opening sentences, then follow with supporting detail
- Avoid burying the key point deep in long notes; embeddings may truncate later sections

### After every `remember` — check for relationships immediately
You have full session context right now. That advantage is gone next session.
Before moving on, ask yourself:

1. Did I `recall` anything earlier in this session that this note connects to?
2. Did I just store multiple notes in this session that relate to each other?
3. Does the new note explain, exemplify, or supersede something I already know exists?

If yes to any of these, call `relate` now. Pick the most specific type:

| If the new note…                                  | Use           |
|---------------------------------------------------|---------------|
| and the other note are about the same topic       | `related-to`  |
| clarifies *why* the other note's decision was made | `explains`   |
| is a concrete case of a general pattern           | `example-of`  |
| replaces a previous decision or approach          | `supersedes`  |

If nothing comes to mind within a few seconds, skip it — don't force links.

### When to call `update`
- When a stored memory becomes outdated — a decision was revisited, a dependency
  upgraded, a pattern changed.
- When you recall something and notice it's stale or partially wrong.
- Don't create a new memory for something that already exists — update the old one.
- Preserve the existing lifecycle unless you are intentionally changing it.

### When to call `forget`
- When a memory is fully superseded and keeping it would cause confusion.
- Don't forget things just because they're old — outdated context can still be
  useful if clearly dated.

### When to call `consolidate`
- When you notice duplicate or highly similar memories from repeated `remember` calls
- When a cluster of related notes should become one comprehensive note
- When a feature or bug arc is complete and incremental captures can be synthesized

**Consolidation modes:**
- `supersedes` (default) — Creates a new consolidated note and marks sources with `supersedes` relationship. Preserves history, allows pruning later with `prune-superseded`.
- `delete` — Creates a new consolidated note and deletes sources. Clean and immediate.
- When all source notes are `temporary`, consolidation should normally use delete behavior so the temporary scaffolding is removed after the durable note is created.
- The consolidated note should be `permanent` by default.

**Workflow:**
1. Run `consolidate` with `strategy: "dry-run"` to see analysis
2. Review `suggest-merges` output for actionable recommendations
3. Execute a merge with `strategy: "execute-merge"` and a `mergePlan`
4. Optionally run `consolidate` with `strategy: "prune-superseded"` to clean up old notes

### Memory hygiene
- Use `memory_graph` to spot dense clusters of related notes — these are consolidation candidates.
- Use `recent_memories` or `project_memory_summary` to orient before a session and catch stale notes.
- Prefer `update` over `remember` when a note already covers the topic. Prefer `consolidate` when 3+ notes on the same topic have accumulated.

### Working with relationships
- After `recall`, check the `related:` line in each result. Call `get` with those ids
  to pull in the linked context before acting — you may already have the answer.
- Prefer `supersedes` over `forget` when the old memory has historical value.
- Don't over-link. One or two meaningful edges per note is better than linking everything.

### Scoping rules
- Pass `cwd` for anything specific to the current project.
- Pass `cwd` even when storing privately with `scope: "global"`; `cwd` controls project association, `scope` controls storage.
- Omit `cwd` only for truly cross-project or personal memories.
- Omit `cwd` for things that apply across all projects (user preferences,
  cross-project patterns, general facts about the user).
- When recalling, always pass `cwd` if you're in a project — the boost ensures
  project context surfaces first without losing global knowledge.

## MCP output style

Mnemonic intentionally keeps MCP responses text-first because the primary consumer is an LLM reading tool output in-context.

Guidelines:
- prefer compact, semantically explicit text over structured payloads
- always distinguish `project` from `stored` when both matter
- reuse stable labels like `project:`, `stored:`, `policy:`, and `updated:`
- answer first, details second
- keep summaries grouped and shallow rather than returning large raw dumps
- add non-text structure only when real LLM failure cases show text is not enough

### Memory quality
- Titles should be searchable: "JWT RS256 migration rationale" not "auth stuff"
- Content should be self-contained: written as if you'll have no other context
  when you read it later.
- Tags should be consistent: use the same terms you'd use in a search query.
- Be specific about dates and versions when they matter:
  "as of March 2026, using Prisma 5.x"
```
