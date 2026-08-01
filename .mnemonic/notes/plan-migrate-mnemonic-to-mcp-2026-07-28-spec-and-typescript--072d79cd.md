---
title: 'Plan: Migrate mnemonic to MCP 2026-07-28 spec and TypeScript SDK v2'
tags:
  - rpir
  - workflow
  - plan
  - mcp-2026-07-28
lifecycle: temporary
createdAt: '2026-08-01T10:44:02.956Z'
updatedAt: '2026-08-01T10:44:02.956Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mnemonic-mcp-tools-inventory-47499799
    type: related-to
  - id: mnemonic-project-overview-and-purpose-763b7a51
    type: related-to
memoryVersion: 1
---
# Plan: MCP 2026-07-28 + TypeScript SDK v2 Migration

Single PR, 5 stages executed sequentially.

## Stage 1: Dependency Swap

- Remove `@modelcontextprotocol/sdk` v1.30.0
- Add `@modelcontextprotocol/server` v2.0.0
- Update all import paths across `src/` and `tests/`

## Stage 2: Core API Migration

- **`src/index.ts`**: Remove the `tools/list` override (~54 lines: `ListToolsRequestSchema`, `toJsonSchemaCompat`, `normalizeObjectSchema`, `internalServer.setRequestHandler`, `_registeredTools` access). Drop `capabilities` from `McpServer` constructor.
- **`src/startup.ts`**: Replace `StdioServerTransport` + `server.connect()` with `serveStdio(() => buildServer())` from `@modelcontextprotocol/server/stdio`.
- **`src/tools/*.ts`** (29 files): Wrap `inputSchema` from bare shapes to `z.object({...})`. Rename `extra` → `ctx` in handlers. Ensure `CallToolResult` carries `content`.
- **`src/prompts.ts`**: Wrap `argsSchema` in `z.object({...})`.
- **`src/context.ts`** + **`src/server-context.ts`**: Update types for v2 SDK.

## Stage 3: Test Infrastructure + Dogfooding

- **`tests/helpers/mcp.ts`**: Update `callLocalMcpMethod()` and `createPersistentMcpSession()` — v2 `serveStdio()` serves legacy clients so `initialize` handshake still works, but verify response shapes.
- **`tests/helpers/mcp-schema-client.ts`**: Verify `tools/list` response compatibility with v2 format.
- **`scripts/dogfood-document-source.mjs`**: Verify `ensureSession()` still works with v2 server (legacy shim).
- **`scripts/run-dogfood-packs.mjs`**: Same.
- Run `npm test` + `npm run dogfood:isolated`. Both must pass.

## Stage 4: Protocol Improvements

- Add `cacheHints` to `McpServer` options for `tools/list` caching (1h TTL).
- Verify all `outputSchema` fields respect structured output contract (`.describe()`, tool description `Returns`, text output parity).

## Stage 5: Documentation + Memory Sync

- **`ARCHITECTURE.md`**: Update MCP server entry point section, remove mention of `tools/list` override, document `serveStdio()`, update source layout table.
- **`README.md`**: Note MCP 2026-07-28 compliance, updated dependency.
- **`AGENT.md`**: Verify tool table accuracy.
- **`CHANGELOG.md`**: Curated migration entry.
- **`docs/index.html`**: Mention spec version support.
- Update permanent design notes:
  - `mnemonic-project-overview-and-purpose-763b7a51` — update SDK reference
  - `mnemonic-source-file-layout-4d11294d` — reflect new `src/index.ts` structure
  - `mnemonic-mcp-tools-inventory-47499799` — refresh if needed

## Schema Version Hack

- The `tools/list` override (commits e6321f6 + 717ea3f) is the "hack" — originally patch-package, then runtime override.
- V2 SDK defaults to JSON Schema 2020-12 → **entire override removed** in Stage 2.

## Subagent Delegation

- `inputSchema` wrapping across 29 tool files delegated to subagents (model: `deepseek/deepseek-v4-flash`).
- Core migration (Stages 1-2) kept in main context.

## Structured Content Contract Check (Stage 4)

- Verify no `outputSchema` drift from v2 SDK conversion.
- Ensure all Zod output schema fields have `.describe()`.
- Verify text output parity for all structured content fields.

## Dogfooding

- `verify:release` chain = `build → test → dogfood:isolated` — all three must pass.
- Dogfood scripts (`dogfood-document-source.mjs`, `run-dogfood-packs.mjs`) use raw JSON-RPC with `initialize` handshake — v2 `serveStdio()` legacy shim serves them transparently, but response shape verification needed.

## Design Constraints (all stages)

- File-first, git-backed — no I/O changes
- Fail-soft to undefined
- No new I/O on cold paths
- Structured output: `.describe()` + tool description `Returns` + text output parity
- Changelog curated, not commit log
- Docs sync: ARCHITECTURE.md, README.md, AGENT.md, docs/index.html
