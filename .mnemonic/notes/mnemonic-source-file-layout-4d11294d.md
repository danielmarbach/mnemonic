---
title: mnemonic — source file layout
tags:
  - architecture
  - files
  - typescript
  - structure
createdAt: '2026-03-07T17:58:59.865Z'
updatedAt: '2026-03-07T18:00:23.890Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mnemonic-project-overview-and-purpose-763b7a51
    type: explains
  - id: mnemonic-bugs-fixed-during-initial-setup-e4faea32
    type: related-to
---
All source files are TypeScript at the project root (not under `src/`):

- `index.ts` — MCP server entry point, all tool registrations, config, startup
- `storage.ts` — read/write notes (markdown + YAML frontmatter) and embeddings (JSON); defines `Note`, `Relationship`, `RelationshipType`, `EmbeddingRecord`
- `embeddings.ts` — Ollama HTTP client, cosine similarity, `embedModel` constant
- `git.ts` — git operations via `simple-git`; `GitOps` class, `SyncResult` type
- `project.ts` — detect project from `cwd` via git remote URL normalization

Build output goes to `build/`. `tsconfig.json` targets ES2022, Node16 module resolution.

**Important:** `simpleGit()` must be called in `GitOps.init()`, not the constructor — the vault directory doesn't exist until `Storage.init()` runs first.
