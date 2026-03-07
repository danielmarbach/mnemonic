---
title: mnemonic — MCP tools inventory
tags:
  - tools
  - mcp
  - api
createdAt: '2026-03-07T17:59:25.498Z'
updatedAt: '2026-03-07T18:00:15.571Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mnemonic-relationship-graph-implementation-386be386
    type: related-to
---
Tools registered in `index.ts`:

| Tool | Description |
|------|-------------|
| `detect_project` | Resolve `cwd` to stable project id via git remote URL |
| `remember` | Write note + embedding, git commit + push |
| `recall` | Semantic search with optional project boost (+0.15) |
| `update` | Update content/title/tags, always re-embeds |
| `forget` | Delete note + embedding, commit; cleans up dangling `relatedTo` references |
| `list` | List notes filtered by project scope and/or tags |
| `get` | Fetch one or more notes by exact id |
| `relate` | Create typed relationship (bidirectional by default) |
| `unrelate` | Remove relationship between two notes |
| `sync` | fetch → pull (rebase) → push → auto-embed pulled notes |
| `reindex` | Rebuild missing embeddings; `force=true` rebuilds all |

Relationship types: `related-to`, `explains`, `example-of`, `supersedes`.
