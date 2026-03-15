---
title: mnemonic — MCP tools inventory
tags:
  - tools
  - mcp
  - api
lifecycle: permanent
createdAt: '2026-03-07T17:59:25.498Z'
updatedAt: '2026-03-15T15:06:48.181Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mnemonic-relationship-graph-implementation-386be386
    type: related-to
  - id: mnemonic-consolidate-tool-design-b9cbac6a
    type: explains
  - id: mcp-prompt-for-cross-tool-workflow-guidance-instead-of-syste-d090a839
    type: related-to
  - id: remember-tool-checkedforexisting-is-schema-only-agent-hint-w-a2c94093
    type: related-to
memoryVersion: 1
---
Tools registered in `src/index.ts`:

| Tool | Description |
| ---- | ----------- |
| `consolidate` | Analyze and consolidate memories — detect duplicates, suggest merges, execute with `supersedes` or `delete` mode |
| `detect_project` | Resolve `cwd` to stable project id via git remote URL; includes current write policy |
| `discover_tags` | List existing tags with usage counts and examples for consistent terminology |
| `execute_migration` | Execute a named migration (supports dry-run) |
| `forget` | Delete note + embedding, commit; cleans up dangling `relatedTo` references |
| `get` | Fetch one or more notes by exact id — returns full content, metadata, and relationships |
| `get_project_identity` | Show effective project identity and remote override |
| `get_project_memory_policy` | Show the saved default write scope for a project |
| `list` | List memories with optional previews, relations, storage, timestamps, and `storedIn` filtering |
| `list_migrations` | List available migrations and pending count |
| `memory_graph` | Show a compact adjacency list of note relationships |
| `move_memory` | Move a memory between vaults without changing its id; accepts optional `vaultFolder` to target sub-vaults |
| `project_memory_summary` | Summarize what mnemonic knows about the current project |
| `recall` | Semantic search with optional project boost (+0.15) |
| `recent_memories` | Show the most recently updated memories for a scope and storage location |
| `remember` | Write note + embedding with project context from `cwd` and storage controlled by `scope`; `checkedForExisting` is a schema-only agent hint |
| `relate` | Create typed relationship (bidirectional by default) |
| `set_project_identity` | Save which git remote defines project identity |
| `set_project_memory_policy` | Set the default write scope and consolidation mode for a project |
| `sync` | Git sync when a remote exists, then always backfills missing local embeddings; `force=true` rebuilds all embeddings |
| `unrelate` | Remove relationship between two notes |
| `update` | Update content/title/tags, always re-embeds |
| `where_is_memory` | Show a memory's project association and actual storage location — lightweight alternative to `get` |

Relationship types: `related-to`, `explains`, `example-of`, `supersedes`.

## Prompts

| Prompt | Description |
| ------ | ----------- |
| `mnemonic-workflow-hint` | Optional, on-demand. Covers discover → inspect → modify → organize pattern, storage-label model, and `recall` → `get` → `update` preference. Not auto-injected. |

Main-vault operational config lives in `config.json`, including `reindexEmbedConcurrency`, per-project memory policies, and consolidation mode defaults.

## Key design note: sync owns embedding rebuilds

`sync` is now the single recovery path for local embeddings:

- it still performs git fetch/pull/push when a remote exists
- it also backfills missing local embeddings even when no remote exists or git is disabled
- `sync force=true` rebuilds all embeddings regardless of whether the current model already has them

This makes `sync` the tool that brings a vault to a fully operational state, instead of splitting that responsibility across `sync` and a separate `reindex` tool.

## Zod schemas

The structured-content module still contains result schemas and types for removed tools as historical implementation detail, but `src/index.ts` no longer registers `reindex`.

## storageLabel return type

`storageLabel(vault: Vault)` returns one of three values:

- `"main-vault"` for the global vault
- `"project-vault"` for the primary project vault (`.mnemonic/`)
- `` `sub-vault:${vaultFolderName}` `` for named sub-vaults (`.mnemonic-<name>/`)
