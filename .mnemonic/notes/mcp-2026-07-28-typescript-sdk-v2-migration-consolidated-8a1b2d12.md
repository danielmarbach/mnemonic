---
title: MCP 2026-07-28 + TypeScript SDK v2 migration (consolidated)
tags:
  - rpir
  - workflow
  - plan
  - mcp-2026-07-28
  - request
  - research
  - review
lifecycle: permanent
createdAt: '2026-08-30T11:24:15.316Z'
updatedAt: '2026-08-30T11:24:15.316Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mnemonic-mcp-tools-inventory-47499799
    type: related-to
  - id: mnemonic-project-overview-and-purpose-763b7a51
    type: related-to
memoryVersion: 1
---
Consolidate the completed MCP 2026-07-28 + TypeScript SDK v2 migration arc (request, research, plan, review) into a single permanent architecture record; the durable spec knowledge (stateless protocol, MRTR, cacheable lists) was previously captured nowhere.

Migration to the MCP 2026-07-28 protocol revision on TypeScript SDK v2, completed and verified (1,305 tests across 75 files, dogfood isolated green, net −974 lines).

## Spec changes adopted (2026-07-28 — the largest revision; designed to be the last compatibility-breaking one)

- **Stateless protocol**: `initialize`/`initialized` handshake retired (SEP-2575, SEP-2567); `Mcp-Session-Id` removed; each request self-describes (protocol version, client identity, capabilities in `_meta`); optional `server/discover` RPC for capability discovery; any request can land on any instance behind plain round-robin load balancing
- **Multi Round-Trip Requests (MRTR)** replace server-initiated `elicitation/create`, `sampling/createMessage`, `roots/list`: server returns `resultType: "input_required"` with embedded requests; client retries the original call with `inputResponses` attached; `requestState` carries opaque state across rounds — mnemonic uses MRTR for protected-branch consent decisions
- **Header-based routing** (`Mcp-Method`, `Mcp-Name`) on Streamable HTTP lets gateways/WAFs/rate limiters route without parsing JSON bodies
- **Cacheable list results**: `tools/list`, `prompts/list`, `resources/list`, `resources/read` carry `ttlMs` and `cacheScope`
- **Other**: JSON Schema 2020-12 now default; RFC 9207 `iss` validation, DCR deprecated in favor of CIMD; Tasks move to `io.modelcontextprotocol/tasks` extension; Sampling, Roots, Logging deprecated (SEP-2577)

## TypeScript SDK v2 specifics

- Package split: `@modelcontextprotocol/server` + `@modelcontextprotocol/client` (optional `/express`, `/fastify`, `/hono`, `/node` middleware); v1 `@modelcontextprotocol/sdk` monolith removed from dependencies — Renovate no longer attempts v1 updates
- `serveStdio(() => buildServer())` from `@modelcontextprotocol/server/stdio` selects protocol era per connection; hand-constructed `McpServer` + `StdioServerTransport` speaks 2025-era only; per-request identity via `ctx.mcpReq.envelope`, not `getClientCapabilities()`
- Requirements: Node ≥ 22.19, Zod ≥ 4.2, TypeScript ≥ 6

## What changed in mnemonic

- Removed the ~54-line `tools/list` JSON Schema 2020-12 override (`_registeredTools` + `internalServer.setRequestHandler` internal-access hack, originally patch-package then runtime override) — the v2 SDK emits 2020-12 natively
- `src/startup.ts`: `server.connect(new StdioServerTransport())` → `serveStdio(() => server)`; `McpServer` constructor format updated, `capabilities` arg dropped
- Added `cacheHints` on `tools/list`: 1-hour TTL, private cache scope (28 tools; agents re-request the catalog frequently)
- 31 files moved imports `@modelcontextprotocol/sdk/server/mcp.js` → `@modelcontextprotocol/server`

## What did NOT need changing

- `inputSchema` was already wrapped as `z.object({...})` (Zod v4 migration had done it); no tool used the v1 `extra` handler param; `prompts.ts` had no `argsSchema` to wrap
- **Legacy shim**: the v2 server still serves v1-era clients (initialize handshake) transparently — test helpers and raw-JSON-RPC dogfood scripts unchanged

## Residual notes

- Two tests (`sync-migrations`, `writable-attachment`) can fail under high parallelism but pass in isolation — pre-existing flakiness, not SDK-related
- Memory sync at migration time: `mnemonic-project-overview-and-purpose` SDK reference and `mnemonic-source-file-layout` layout were updated

Consolidated from request `request-migrate-mnemonic-to-mcp-2026-07-28-specification-and-fda9bab6`, research `research-mcp-2026-07-28-spec-changes-and-typescript-sdk-v2-m-57bad211`, plan `plan-migrate-mnemonic-to-mcp-2026-07-28-spec-and-typescript--072d79cd`, and review `review-mcp-2026-07-28-typescript-sdk-v2-migration-f9c93e37`.
