# mnemonic — Agent Context

## What this project is

A personal MCP memory server. The goal is to give LLMs persistent, cross-session memory that syncs across machines without running a permanent service or database.

The core idea: store everything as plain markdown files in a git repo, compute embeddings locally via Ollama, and expose it all through an MCP server. No Postgres, no Docker services that need to stay running — just files, git, and a Node process that the MCP client spawns on demand.

Inspired by [petabridge/memorizer](https://github.com/petabridge/memorizer) but without the Postgres/pgvector dependency.

## Dogfooding protocol

When implementing a new feature or behavior in mnemonic itself, dogfood the local MCP server as part of the work:
- Rebuild first (`npm run build`) so the stdio server uses the latest code.
- Prefer the repo-local helper (`npm run mcp:local` or `scripts/mcp-local.sh`) when wiring a local MCP client to mnemonic during development.
- Use the project-scoped `mnemonic` MCP server for real operations whenever the feature touches memory behavior, note formatting, retrieval, relationships, sync, or indexing.
- Prefer exercising the feature through MCP tools (`remember`, `update`, `get`, `relate`, `recall`, etc.) instead of writing `.mnemonic/` files directly.
- Mnemoize important implementation decisions, tradeoffs, and debugging findings through the MCP server so future agents can recall them.
- If manual file edits are temporarily needed for recovery or cleanup, follow up by recreating or validating the final state through MCP before considering the task done.

## Design decisions and rationale

### Markdown + YAML frontmatter as storage
Notes are plain `.md` files with YAML frontmatter. This was chosen deliberately:
- Human-readable and editable outside the tool
- Git-diffable — merge conflicts are resolvable by a human
- One file per note means conflicts are isolated to the specific note that was edited simultaneously on two machines
- No lock-in — the vault is just a folder of text files

### Embeddings are local-only (gitignored)
Embeddings are stored as individual JSON files in `embeddings/` but this folder is gitignored. Rationale:
- Embeddings are derived/generated data — they can always be recomputed from the notes
- Committing them would introduce binary-ish merge conflicts that can't be resolved meaningfully (you can't merge two float arrays)
- At personal scale (hundreds to low thousands of notes), reindexing on a new machine is fast enough
- The `sync` tool handles this automatically: after pulling it embeds any notes that arrived without embeddings

Alternative considered: commit embeddings and use `merge=ours` strategy in `.gitattributes` to always take the local version on conflict. Valid approach if reindex time becomes painful at large scale.

### Project scoping via git remote URL
Project identity is derived by running `git remote get-url origin` from the provided `cwd`, then normalizing the URL to a stable slug:
- `git@github.com:acme/myapp.git` → `github-com-acme-myapp`
- `https://github.com/acme/myapp` → `github-com-acme-myapp`

This ensures the same project is recognized across machines regardless of local clone path. Fallback chain: git remote → git root folder name → directory name.

### Project-boosted recall, not hard filtering
When `recall` is called with a `cwd`, project-specific notes get a **+0.15 cosine similarity boost** rather than being the only results returned. This means:
- Project context surfaces first
- Global memories (user preferences, cross-project knowledge) are still accessible
- The LLM gets a richer, more complete context window

### Multi-vault architecture
There are two kinds of vault:

- **Main vault** (`~/mnemonic-vault` by default) — private global memories. Managed as its own git repo. Notes without a project scope live here.
- **Project vault** (`<git-root>/.mnemonic/`) — project-specific memories committed directly into the project repo. Created on demand when `remember` is called with a `cwd`. Collaborators cloning the project repo get the vault for free.

Routing rules:
- `cwd` identifies project context; write location is a separate choice.
- `remember` with `cwd` and `scope: "project"` → writes to the project vault (creates `.mnemonic/` if absent).
- `remember` with `cwd` and `scope: "global"` → writes to the main vault but keeps the project id/name in frontmatter.
- If `scope` is omitted, a saved per-project memory policy is used first; otherwise mnemonic falls back to `project` when `cwd` is present.
- If the policy is `ask`, do not guess. Ask one targeted question with two clear options: `Project vault` (recommended for shared project knowledge) or `Private main vault` (for personal/project-associated notes). Then call `remember` again with the chosen `scope`.
- `remember` without `cwd` → writes to the main vault as a normal global memory.
- `recall`, `list`, `get`, `sync`, `reindex` — operate on the project vault first, then the main vault.
- `relate`/`unrelate`/`forget` — find notes in any vault; commit changes per vault.

The main vault's own git repo is excluded from project-vault detection (`isMainRepo()` guard) so mnemonic's own directory is never treated as a project vault.

### Main vault config
Machine-local runtime settings live in the main vault's `config.json`. Use this for operational tuning and persistent MCP behavior that should survive across sessions without becoming a memory note. This includes `reindexEmbedConcurrency` and per-project memory policy defaults.

### Bidirectional sync with auto-embedding
`sync` does: fetch → record local HEAD → pull (rebase) → diff `notes/` to find what changed → push → embed any notes that arrived. This is a single tool call that handles the full sync cycle. Rebase is used instead of merge to keep history linear. `sync` always syncs the main vault; pass `cwd` to also sync the project vault.

### MCP output style
This MCP is optimized for direct LLM consumption, so tool outputs should stay text-first.

Output rules:
- Prefer compact, semantically explicit text over structured payloads.
- Always name both **project association** and **storage location** when both matter.
- Use stable labels such as `project:`, `stored:`, `policy:`, `updated:` so LLMs can scan reliably.
- Put the answer first, then supporting detail.
- Keep lists shallow and grouped by purpose; avoid dumping raw note bodies unless the tool is explicitly for retrieval.
- Only add structured/non-text responses if repeated LLM failures show that text is insufficient for a specific tool.

Token-efficiency rules:
- Optimize for clarity first, token use second.
- Keep default responses concise; make extra detail opt-in.
- Prefer one good summary tool over forcing multiple smaller calls.
- Avoid repeating the same metadata in multiple sections when one summary line is enough.
- Compress counts and state into a single line when it stays readable.
- Do not shorten labels so much that `project`, `stored`, or `policy` become ambiguous.

Formatting rules:
- Use short headings or lead lines for orientation tools.
- Use bullets for enumerations and state summaries.
- Keep wording consistent across tools for `project`, `scope`, `stored`, and `policy`.
- For distinction-heavy outputs, prefer explicit phrases like `project: mnemonic` and `stored: main-vault` instead of implying one from the other.

## Architecture

```
src/index.ts      — MCP server, all tool registrations
src/storage.ts    — read/write notes (markdown) and embeddings (JSON)
src/embeddings.ts — Ollama HTTP client, cosine similarity
src/git.ts        — git operations via simple-git, SyncResult type
src/project.ts    — detect project from cwd via git remote URL
src/vault.ts      — VaultManager: routing between main vault and project vaults
```

### Key types

```typescript
type RelationshipType = "related-to" | "explains" | "example-of" | "supersedes";

interface Relationship {
  id: string;
  type: RelationshipType;
}

// A stored memory
interface Note {
  id: string;           // slug-uuid e.g. "auth-bug-fix-a1b2c3d4"
  title: string;
  content: string;      // markdown body
  tags: string[];
  project?: string;     // stable project id e.g. "github-com-acme-myapp"
  projectName?: string; // human-readable e.g. "myapp"
  relatedTo?: Relationship[];
  createdAt: string;    // ISO 8601
  updatedAt: string;
}

// Local embedding cache
interface EmbeddingRecord {
  id: string;
  model: string;        // e.g. "nomic-embed-text"
  embedding: number[];  // 768-dimensional for nomic-embed-text
  updatedAt: string;
}

// Returned by git.sync()
interface SyncResult {
  hasRemote: boolean;
  pulledNoteIds: string[];   // notes that arrived/changed during pull
  deletedNoteIds: string[];  // notes deleted on remote
  pushedCommits: number;
}
```

### Vault layout

**Main vault** (private, `~/mnemonic-vault`):
```
~/mnemonic-vault/
  .gitignore          ← auto-written on startup, contains "embeddings/"
  notes/
    <id>.md           ← global memories
  embeddings/
    <id>.json         ← local only, never committed
```

**Project vault** (shared, inside the project repo):
```
<git-root>/
  .mnemonic/
    .gitignore        ← auto-written, contains "embeddings/"
    notes/
      <id>.md         ← project memories, committed to the project repo
    embeddings/
      <id>.json       ← local only, never committed
```

### Note format

```markdown
---
title: JWT RS256 migration rationale
tags: [auth, jwt, architecture]
project: github-com-acme-myapp
projectName: myapp
relatedTo:
  - id: auth-bug-fix-a1b2c3d4
    type: related-to
  - id: security-policy-b5c6d7e8
    type: explains
createdAt: 2026-03-07T10:00:00.000Z
updatedAt: 2026-03-07T10:00:00.000Z
---

We switched from HS256 to RS256 because...
```

## Tools

| Tool             | Description                                                                    |
|------------------|--------------------------------------------------------------------------------|
| `detect_project` | Resolve a `cwd` to a stable project id via git remote URL                     |
| `remember`       | Write a note + embedding; `cwd` sets project context and `scope` picks storage |
| `set_project_memory_policy` | Save the default write scope for a project (`project`, `global`, or `ask`) |
| `get_project_memory_policy` | Show the saved default write scope for a project                |
| `project_memory_summary` | Summarize what mnemonic currently knows about a project          |
| `recall`         | Semantic search with optional project boost                                    |
| `update`         | Update note content/title/tags, always re-embeds                               |
| `where_is_memory` | Show a note's project association and actual storage location                 |
| `move_memory`    | Move a note between `main-vault` and `project-vault` without changing its id |
| `forget`         | Delete note + embedding, git commit + push; cleans up dangling relationships   |
| `list`           | List notes filtered by project scope/tags/storage, optionally with previews/relations |
| `get`            | Fetch one or more notes by exact id                                            |
| `relate`         | Create a typed relationship between two notes (bidirectional by default)       |
| `unrelate`       | Remove a relationship between two notes                                        |
| `recent_memories` | Show the most recently updated notes for a scope                              |
| `memory_graph`   | Show a compact adjacency list of note relationships                            |
| `sync`           | Bidirectional git sync — pull, push, auto-embed pulled notes                   |
| `reindex`        | Manually rebuild missing embeddings; `force=true` rebuilds all                 |

## Environment variables

| Variable      | Default                  | Description                    |
|---------------|--------------------------|--------------------------------|
| `VAULT_PATH`  | `~/mnemonic-vault`       | Vault location                 |
| `OLLAMA_URL`  | `http://localhost:11434` | Ollama server                  |
| `EMBED_MODEL` | `nomic-embed-text`       | Embedding model                |
| `DISABLE_GIT` | `false`                  | Skip all git ops if `"true"`   |

## Stack

- **TypeScript** (Node16 module resolution, ES2022 target)
- **@modelcontextprotocol/sdk** — MCP server, stdio transport
- **simple-git** — git operations
- **gray-matter** — markdown frontmatter parsing
- **zod** — MCP tool input schema validation
- **Ollama** (external, HTTP) — local embeddings via `nomic-embed-text`

## Things not to change without good reason

- **One file per note** — critical for git conflict isolation. Don't aggregate notes into a single file.
- **Embeddings gitignored** — deliberate. Don't start committing them unless reindex time becomes a real problem and you've added `.gitattributes merge=ours`.
- **Rebase on pull** — `git pull --rebase` keeps history linear. Don't switch to merge without understanding the tradeoff on a personal vault.
- **Project id from git remote, not local path** — the normalization in `src/project.ts` is what makes cross-machine consistency work. Local paths differ; remote URLs don't.
- **Similarity boost, not hard filter** — `recall` boosts project notes rather than excluding global ones. This is intentional: global memories (preferences, patterns) should remain accessible in project context.
- **`simpleGit()` in `GitOps.init()`, not the constructor** — the vault directory is created by `Storage.init()` which runs after `GitOps` is constructed. Calling `simpleGit()` in the constructor throws `GitConstructError`.
- **Project vault in `.mnemonic/` inside the project repo** — this makes notes shareable with collaborators via normal git. Don't move them back into the main vault.
- **`isMainRepo()` guard in `VaultManager`** — prevents the main vault's own git repo from being treated as a project vault. Don't remove it.

## Known limitations and future work

- **Bounded parallel embedding on reindex** — `embedMissingNotes()` runs with a small concurrency limit to speed up large reindexes without flooding Ollama. Increase carefully if local embedding throughput becomes a bottleneck.
- **No full-text fallback** — if Ollama is down, `recall` fails entirely. A fallback to simple keyword search over note content would improve resilience.
- **Embedding model mismatch** — if you change `EMBED_MODEL`, existing embeddings are stale. `reindex --force` fixes this but there's no automatic detection. Could check `EmbeddingRecord.model` against current model and re-embed mismatches.
- **No web UI** — memorizer has one. Out of scope for this project; the vault is just files so any markdown editor works for browsing.
