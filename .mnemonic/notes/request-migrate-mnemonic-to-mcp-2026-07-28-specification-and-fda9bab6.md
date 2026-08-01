---
title: >-
  Request: Migrate mnemonic to MCP 2026-07-28 specification and TypeScript SDK
  v2
tags:
  - rpir
  - workflow
  - request
lifecycle: temporary
createdAt: '2026-08-01T10:39:47.907Z'
updatedAt: '2026-08-01T10:44:10.183Z'
role: context
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: research-mcp-2026-07-28-spec-changes-and-typescript-sdk-v2-m-57bad211
    type: related-to
  - id: plan-migrate-mnemonic-to-mcp-2026-07-28-spec-and-typescript--072d79cd
    type: related-to
memoryVersion: 1
---
# Request: Migrate to MCP 2026-07-28 + TypeScript SDK v2

## What

Migrate mnemonic from `@modelcontextprotocol/sdk` v1.x to `@modelcontextprotocol/server` v2.0.0, adopting the MCP 2026-07-28 protocol revision.

## Why

- MCP 2026-07-28 is the largest spec revision ever, making MCP stateless
- TypeScript SDK v2 is the stable release line going forward
- JSON Schema 2020-12 now the default — mnemonic's hacky `tools/list` override can be removed
- Cache hints for tool lists can reduce token waste for clients
- Cleaner architecture: no more SDK-internal access (`_registeredTools`)

## Scope

- Replace `@modelcontextprotocol/sdk` with `@modelcontextprotocol/server`
- Migrate stdio transport: `server.connect(StdioServerTransport)` → `serveStdio()`
- Wrap all `inputSchema` from bare shapes to `z.object({...})` (Standard Schema)
- Remove `tools/list` JSON Schema 2020-12 override (~50 lines)
- Update test helpers (no more `initialize` handshake)
- Add cache hints for tools/list
- Update ARCHITECTURE.md, README.md, AGENT.md, CHANGELOG.md, docs/index.html

## Design Constraints (from mnemonic memory)

- File-first, git-backed — no database, no daemon
- Fail-soft to undefined
- Structured output contract (Zod .describe(), tool descriptions, text output)
- No new I/O on cold/fallback paths
- Changelog and docs sync across all surfaces
- RPIR workflow discipline

## References

- <https://blog.modelcontextprotocol.io/posts/2026-07-28/>
- <https://devblogs.microsoft.com/dotnet/announcing-v20-of-the-official-mcp-csharp-sdk/>
- <https://aws.amazon.com/blogs/machine-learning/how-agentcore-gateway-supports-the-mcp-2026-07-28-spec/>
- <https://ts.sdk.modelcontextprotocol.io/v2/migration/support-2026-07-28>
- SDK currently at v1.30.0 (via Renovate lockfile bump)
