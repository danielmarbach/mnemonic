---
title: mnemonic — MCP tools inventory
tags:
  - tools
  - mcp
  - api
createdAt: '2026-03-07T17:59:25.498Z'
updatedAt: '2026-03-09T19:45:58.012Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mnemonic-relationship-graph-implementation-386be386
    type: related-to
  - id: mnemonic-consolidate-tool-design-b9cbac6a
    type: explains
memoryVersion: 1
---
Tools registered in `src/index.ts`:

| Tool | Description |
| ---- | ----------- |
| `consolidate` | Analyze and consolidate memories — detect duplicates, suggest merges, execute with `supersedes` or `delete` mode |
| `detect_project` | Resolve `cwd` to stable project id via git remote URL; includes current write policy |
| `execute_migration` | Execute a named migration (supports dry-run) |
| `forget` | Delete note + embedding, commit; cleans up dangling `relatedTo` references |
| `get` | Fetch one or more notes by exact id — returns full content, metadata, and relationships |
| `get_project_identity` | Show effective project identity and remote override |
| `get_project_memory_policy` | Show the saved default write scope for a project |
| `list` | List memories with optional previews, relations, storage, timestamps, and `storedIn` filtering |
| `list_migrations` | List available migrations and pending count |
| `memory_graph` | Show a compact adjacency list of note relationships |
| `move_memory` | Move a memory between `main-vault` and `project-vault` without changing its id |
| `project_memory_summary` | Summarize what mnemonic knows about the current project |
| `recall` | Semantic search with optional project boost (+0.15) |
| `recent_memories` | Show the most recently updated memories for a scope and storage location |
| `reindex` | Rebuild missing embeddings; `force=true` rebuilds all. Works without a git remote (unlike `sync` which skips embed when no remote configured). |
| `remember` | Write note + embedding with project context from `cwd` and storage controlled by `scope` |
| `relate` | Create typed relationship (bidirectional by default) |
| `set_project_identity` | Save which git remote defines project identity |
| `set_project_memory_policy` | Set the default write scope and consolidation mode for a project |
| `sync` | fetch → pull (rebase) → push → auto-embed pulled notes (only embeds when remote exists) |
| `unrelate` | Remove relationship between two notes |
| `update` | Update content/title/tags, always re-embeds |
| `where_is_memory` | Show a memory's project association and actual storage location — lightweight alternative to `get` |

Relationship types: `related-to`, `explains`, `example-of`, `supersedes`.

Main-vault operational config lives in `config.json`, including `reindexEmbedConcurrency`, per-project memory policies, and consolidation mode defaults.

## Key design note: reindex vs sync

`reindex` is NOT redundant with `sync`:

- `sync` only backfills embeddings when `hasRemote` is true — vaults with no remote (or `DISABLE_GIT=true`) never get embeddings via sync
- `reindex force=true` rebuilds all embeddings regardless of model — sync's backfill skips existing same-model embeddings
- Separation: `sync` = git operations (with incidental embedding of new pulls), `reindex` = embedding-only rebuild

## Zod schemas

All three new tools have both interface types AND Zod output schemas in `src/structured-content.ts`:

- `GetResultSchema`, `WhereIsResultSchema` — added in feat/missing-tools-get-reindex-where-is
- `ReindexResultSchema` — existed but was missing from schema imports in `index.ts`

## storageLabel return type

`storageLabel(vault: Vault)` was widened to return `"project-vault" | "main-vault"` (was `string`) to satisfy the structured result types.
