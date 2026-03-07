# mnemonic

A local MCP memory server backed by plain markdown + JSON files, synced via git. No database. Project-scoped memory with semantic search.

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

You can also set a per-project default once with `set_project_memory_policy`. After that, `remember` uses the saved default whenever `scope` is omitted. Supported defaults are `project`, `global`, and `ask`.

Notes are plain markdown with YAML frontmatter — readable, diffable, mergeable.
Memory content is markdown-linted on `remember`/`update`: fixable issues are auto-corrected before save, and non-fixable issues are rejected.
Embeddings stay local (gitignored) and are rebuilt on each machine with `reindex`.

## Project scoping

Project identity is derived from the **git remote URL** of the working directory, normalized to a stable slug (e.g. `github-com-acme-myapp`). This means the same project is recognized consistently across machines, regardless of local clone paths.

If no remote is configured, the git root folder name is used. If not in a git repo at all, the directory name is used.

When `recall` is called with a `cwd`, it searches both the project vault and the main vault. Project memories are **boosted by +0.15 similarity score** and appear first in results, followed by relevant global memories. You get project-specific context without losing access to cross-project knowledge.

## Prerequisites

- [Ollama](https://ollama.com) running locally with `nomic-embed-text` pulled:
  ```bash
  ollama pull nomic-embed-text
  ```

## Setup

### Native (Node.js 18+)

```bash
npm install
npm run build
npm test
```

### Docker

```bash
docker compose build
docker compose up ollama-init  # pulls nomic-embed-text into the ollama volume (one-time)
```

Ollama runs as a container with a named volume (`ollama-data`) so downloaded models persist across restarts. An `ollama-init` service pulls `nomic-embed-text` on first run; `mnemonic` waits for it to complete before starting.

The vault directory (`~/mnemonic-vault` by default) is bind-mounted from the host, so notes and the git repo stay on your machine.

Override the vault location with an environment variable:

```bash
VAULT_PATH=/path/to/your-vault docker compose run --rm mnemonic
```

Git credentials (`~/.gitconfig` and `~/.ssh`) are mounted read-only so push/pull work inside the container.

## Configuration

| Variable      | Default                  | Description                        |
|---------------|--------------------------|------------------------------------|
| `VAULT_PATH`  | `~/mnemonic-vault`       | Path to your markdown vault        |
| `OLLAMA_URL`  | `http://localhost:11434` | Ollama server URL                  |
| `EMBED_MODEL` | `nomic-embed-text`       | Ollama embedding model             |
| `DISABLE_GIT` | `false`                  | Set `true` to skip all git ops     |

## Claude Desktop / Cursor config

**Native:**
```json
{
  "mcpServers": {
    "mnemonic": {
      "command": "node",
      "args": ["/path/to/mnemonic/build/index.js"],
      "env": {
        "VAULT_PATH": "/Users/you/mnemonic-vault"
      }
    }
  }
}
```

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
| `detect_project` | Identify the project for a given `cwd` (git remote → slug)                     |
| `remember`       | Store a memory with project context from `cwd` and storage controlled by `scope` |
| `set_project_memory_policy` | Set the default write scope for a project (`project`, `global`, or `ask`) |
| `get_project_memory_policy` | Show the saved default write scope for a project                    |
| `recall`         | Semantic search — project-boosted when `cwd` provided                           |
| `update`         | Update content, title, or tags; `cwd` helps locate project notes                |
| `forget`         | Delete a memory by id; cleans up dangling relationships automatically           |
| `list`           | List memories — filter by project scope and/or tags                             |
| `get`            | Fetch one or more memories by exact id                                          |
| `relate`         | Create a typed relationship between two memories (bidirectional by default)     |
| `unrelate`       | Remove a relationship between two memories                                      |
| `sync`           | Bidirectional sync — pulls remote, pushes local commits, auto-embeds new notes  |
| `reindex`        | Manually rebuild missing embeddings (sync does this automatically)              |

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

If a project memory policy exists, omitting `scope` uses that policy first.

If the project policy is `ask`, `remember` returns a clear choice instead of guessing:

- `scope: "project"` — shared project vault (`.mnemonic/`)
- `scope: "global"` — private main vault with project association

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
1. Call `detect_project` with the working directory to identify project context.
2. Call `recall` with a broad query like "project overview architecture decisions"
   and `cwd` set — to surface relevant prior context before doing any work.
3. If the user mentions something you don't recognize, call `recall` before asking
   them to explain — you may already know it.

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

### When to call `forget`
- When a memory is fully superseded and keeping it would cause confusion.
- Don't forget things just because they're old — outdated context can still be
  useful if clearly dated.

### Working with relationships
- After `recall`, check the `related:` line in each result. Call `get` with those ids
  to pull in the linked context before acting — you may already have the answer.
- Prefer `supersedes` over `forget` when the old memory has historical value.
- Don't over-link. One or two meaningful edges per note is better than linking everything.

### Scoping rules
- Pass `cwd` for anything specific to the current project.
- Omit `cwd` for things that apply across all projects (user preferences,
  cross-project patterns, general facts about the user).
- When recalling, always pass `cwd` if you're in a project — the boost ensures
  project context surfaces first without losing global knowledge.

### Memory quality
- Titles should be searchable: "JWT RS256 migration rationale" not "auth stuff"
- Content should be self-contained: written as if you'll have no other context
  when you read it later.
- Tags should be consistent: use the same terms you'd use in a search query.
- Be specific about dates and versions when they matter:
  "as of March 2026, using Prisma 5.x"
```
