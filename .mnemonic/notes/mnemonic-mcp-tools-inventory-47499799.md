---
title: mnemonic — MCP tools inventory
tags:
  - tools
  - mcp
  - api
lifecycle: permanent
createdAt: '2026-03-07T17:59:25.498Z'
updatedAt: '2026-04-26T19:41:01.445Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mnemonic-relationship-graph-implementation-386be386
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
| `consolidate` | Consolidate overlapping memories and run analysis strategies (`detect-duplicates`, `find-clusters`, `suggest-merges`, `dry-run`, `execute-merge`, `prune-superseded`); optional `evidence: true` enriches analysis previews with per-note trust/risk context |
| `detect_project` | Detect effective project identity (id, name) for a working directory |
| `discover_tags` | Suggest canonical tags for a note using title/content/query context; `mode: "browse"` opts into broader inventory output |
| `execute_migration` | Execute a named schema migration (dry-run first) |
| `forget` | Delete a note and its embeddings, and clean up relationship references |
| `get` | Fetch one or more notes by exact id; optional `includeRelationships` adds bounded previews |
| `get_project_identity` | Show current project identity including remote override if set |
| `get_project_memory_policy` | Show saved default write scope and consolidation/protected-branch settings for a project |
| `list` | List memories with optional previews, relations, storage, timestamps, and `storedIn` filtering |
| `list_migrations` | List available migrations and pending count |
| `memory_graph` | Show a compact adjacency list of note relationships |
| `move_memory` | Move a memory between vaults without changing its id; accepts optional `vaultFolder` to target sub-vaults |
| `project_memory_summary` | Session-start entrypoint: themed notes, anchors, orientation, and temporary-note recovery hints |
| `recall` | Semantic search with project-aware ranking, optional `mode: "temporal"` and `mode: "workflow"`, and optional `evidence: "compact"` retrieval rationale |
| `recent_memories` | Show most recently updated memories for a scope and storage location |
| `remember` | Write note + embedding with project context from `cwd` and storage controlled by `scope`; `checkedForExisting` is a schema-only agent hint |
| `relate` | Create typed relationship (bidirectional by default) |
| `set_project_identity` | Save which git remote defines project identity |
| `set_project_memory_policy` | Set default write scope, consolidation mode, and protected-branch behavior for a project |
| `sync` | Git sync when a remote exists, then always backfills missing local embeddings; `force=true` rebuilds all embeddings |
| `unrelate` | Remove relationship between two notes |
| `update` | Update content/title/tags/lifecycle; re-embeds only when projection-driving content changes |
| `where_is_memory` | Show a memory's project association and actual storage location — lightweight alternative to `get` |

Relationship types: `related-to`, `explains`, `example-of`, `supersedes`, `derives-from`, `follows`.

## Prompts

| Prompt | Description |
| ------ | ----------- |
| `mnemonic-workflow-hint` | Optional, on-demand. Covers discover -> inspect -> modify -> organize, summary-first orientation, temporary-note recovery after orientation, and optional evidence enrichment when decision confidence is low. |
| `mnemonic-rpi-workflow` | Optional, on-demand. Returns RPIR stage protocol and conventions for structured request/plan/apply/review execution. |

Main-vault operational config lives in `config.json`, including `reindexEmbedConcurrency`, mutation push behavior, per-project memory policies, and identity overrides.

## Key design notes

- `sync` is the recovery path for embedding completeness: it backfills missing local embeddings even when no remote is available, and `force=true` rebuilds all embeddings.
- Recall ranking uses a small project tiebreaker (not a hard filter), so project context is preferred without excluding global memory.
- Evidence enrichment is opt-in: compact retrieval rationale on `recall`, and richer trust/risk context for consolidation analysis.
