---
title: mnemonic — source file layout
tags:
  - architecture
  - files
  - typescript
  - structure
lifecycle: permanent
createdAt: '2026-03-07T17:58:59.865Z'
updatedAt: '2026-03-07T19:11:53.717Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mnemonic-project-overview-and-purpose-763b7a51
    type: explains
  - id: mnemonic-bugs-fixed-during-initial-setup-e4faea32
    type: related-to
memoryVersion: 1
---
All runtime TypeScript source files live under `src/` to keep the repository layout obvious and predictable.

- `src/index.ts` — MCP server entry point, all tool registrations, config, startup
- `src/storage.ts` — read/write notes (markdown + YAML frontmatter) and embeddings (JSON); defines `Note`, `Relationship`, `RelationshipType`, `EmbeddingRecord`
- `src/embeddings.ts` — Ollama HTTP client, cosine similarity, `embedModel` constant
- `src/git.ts` — git operations via `simple-git`; `GitOps` class, `SyncResult` type
- `src/project.ts` — detect project from `cwd` via git remote URL normalization
- `src/vault.ts` — route between the main vault and project vaults
- `src/markdown.ts` — markdown linting and auto-fix before note persistence

Build output goes to `build/`. `tsconfig.json` uses `rootDir: src` and targets ES2022 with Node16 module resolution.

**Important:** `simpleGit()` must be called in `GitOps.init()`, not the constructor — the vault directory does not exist until `Storage.init()` runs first.

**Organization rule:** keep the repo simple and mostly flat; add feature folders only when the codebase actually pushes for them.
