---
title: mnemonic — MCP tools inventory
tags:
  - tools
  - mcp
  - api
createdAt: '2026-03-07T17:59:25.498Z'
updatedAt: '2026-03-07T19:37:21.683Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mnemonic-relationship-graph-implementation-386be386
    type: related-to
---
Tools registered in `src/index.ts`:

| Tool | Description |
| ---- | ----------- |
| `detect_project` | Resolve `cwd` to stable project id via git remote URL; includes current write policy |
| `remember` | Write note + embedding with project context from `cwd` and storage controlled by `scope` |
| `set_project_memory_policy` | Set the default write scope for a project (`project`, `global`, `ask`) |
| `get_project_memory_policy` | Show the saved default write scope for a project |
| `project_memory_summary` | Summarize what mnemonic knows about the current project |
| `recall` | Semantic search with optional project boost (+0.15) |
| `update` | Update content/title/tags, always re-embeds |
| `forget` | Delete note + embedding, commit; cleans up dangling `relatedTo` references |
| `list` | List memories with optional previews, relations, storage, and timestamps |
| `get` | Fetch one or more notes by exact id |
| `relate` | Create typed relationship (bidirectional by default) |
| `unrelate` | Remove relationship between two notes |
| `recent_memories` | Show the most recently updated memories for a scope |
| `memory_graph` | Show a compact adjacency list of note relationships |
| `sync` | fetch -> pull (rebase) -> push -> auto-embed pulled notes |
| `reindex` | Rebuild missing embeddings; `force=true` rebuilds all |

Relationship types: `related-to`, `explains`, `example-of`, `supersedes`.
