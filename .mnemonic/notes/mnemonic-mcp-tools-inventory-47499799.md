---
title: mnemonic — MCP tools inventory
tags:
  - tools
  - mcp
  - api
lifecycle: permanent
createdAt: '2026-03-07T17:59:25.498Z'
updatedAt: '2026-03-23T21:01:42.867Z'
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
# mnemonic — MCP tools inventory

This note lists every MCP tool exposed by mnemonic with a brief description. Keep this updated when tools are added or changed.

## Tools

| Tool | Description |
| ---- | ----------- |
| `consolidate` | Merge overlapping memories or find duplicates; supports dry-run, suggest-merges, and prune-superseded strategies |
| `detect_project` | Detect effective project identity (id, name) for a working directory |
| `discover_tags` | Suggest canonical tags for a note using title/content/query context; `mode: "browse"` opts into broader inventory output |
| `execute_migration` | Execute a named schema migration (dry-run first) |
| `forget` | Delete a note and its embeddings, clean up relationship references |
| `get` | Fetch one or more notes by exact id with optional preview, relations, and storage info |
| `get_project_identity` | Show current project identity including remote override if set |
| `get_project_memory_policy` | Show saved default write scope and consolidation mode for a project |
| `list` | List memories with optional previews, relations, storage, timestamps, and `storedIn` filtering |
| `list_migrations` | List available migrations and pending count |
| `memory_graph` | Show a compact adjacency list of note relationships |
| `move_memory` | Move a memory between vaults without changing its id; accepts optional `vaultFolder` to target sub-vaults |
| `project_memory_summary` | Session-start entrypoint: themed notes, anchors, and explicit orientation (primaryEntry, suggestedNext, warnings) for fast project orientation |
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

## discover_tags behavior

`discover_tags` now has two modes:

- default `mode: "suggest"` returns bounded `recommendedTags` for a specific note
- explicit `mode: "browse"` returns broader inventory-style `tags`

The intended workflow is to pass note context when tag choice is ambiguous so the tool can suggest canonical tags without flooding the agent with unrelated ones.
