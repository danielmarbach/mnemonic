---
title: mnemonic — project overview and purpose
tags:
  - architecture
  - overview
  - mcp
  - typescript
lifecycle: permanent
createdAt: '2026-03-07T17:58:49.005Z'
updatedAt: '2026-03-08T13:08:05.469Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mnemonic-source-file-layout-4d11294d
    type: explains
  - id: mnemonic-key-design-decisions-3f2a6273
    type: explains
  - id: mnemonic-docker-and-ollama-compose-setup-e58f1e98
    type: related-to
  - id: dynamic-project-context-loading-plan-9f2ed29c
    type: related-to
memoryVersion: 1
---
A personal MCP memory server backed by plain markdown + JSON files, synced via git. No database, no permanent services.

**Core idea:** store notes as `.md` files with YAML frontmatter in a git repo, compute embeddings locally via Ollama (`nomic-embed-text-v2-moe` by default), expose everything through an MCP server that MCP clients (Claude Code, Cursor, etc.) spawn on demand via stdio.

**Embedding transport:** `src/embeddings.ts` uses Ollama's `/api/embed` endpoint with truncation enabled so longer notes still embed safely with the v2 model.

**Stack:** TypeScript, Node.js, `@modelcontextprotocol/sdk`, `simple-git`, `gray-matter`, `zod`, Ollama (external HTTP).

**Vault location:** `~/mnemonic-vault` by default (env: `VAULT_PATH`). One `.md` file per note, embeddings in `embeddings/` (gitignored — local only).

**Repository layout:** runtime code lives in `src/`, compiled output goes to `build/`.

**Entry point:** `build/index.js` (compiled from `src/index.ts`). Run via `node build/index.js`.

**Inspired by:** petabridge/memorizer but without Postgres/pgvector.
