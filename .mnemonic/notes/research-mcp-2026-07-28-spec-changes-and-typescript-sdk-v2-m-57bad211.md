---
title: 'Research: MCP 2026-07-28 spec changes and TypeScript SDK v2 migration impact'
tags:
  - rpir
  - workflow
  - research
  - mcp-2026-07-28
lifecycle: temporary
createdAt: '2026-08-01T10:39:47.900Z'
updatedAt: '2026-08-01T10:44:10.184Z'
role: research
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: request-migrate-mnemonic-to-mcp-2026-07-28-specification-and-fda9bab6
    type: related-to
  - id: plan-migrate-mnemonic-to-mcp-2026-07-28-spec-and-typescript--072d79cd
    type: derives-from
memoryVersion: 1
---
# Research: MCP 2026-07-28 + TypeScript SDK v2 Migration

## Spec Changes

### Core: Stateless Protocol

- `initialize`/`initialized` handshake **retired** (SEP-2575, SEP-2567)
- `Mcp-Session-Id` header removed
- Each request self-describing: carries protocol version, client identity, capabilities in `_meta`
- New `server/discover` RPC for capability discovery (optional, not required)
- Horizontal scaling: any request can land on any instance behind plain round-robin LB

### Multi Round-Trip Requests (MRTR)

- Replaces server-initiated `elicitation/create`, `sampling/createMessage`, `roots/list`
- Server returns `resultType: "input_required"` with embedded requests
- Client retries original call with `inputResponses` attached
- `requestState` — opaque string for server state across rounds

### Header-Based Routing

- `Mcp-Method` and `Mcp-Name` headers on Streamable HTTP
- Gateways/WAFs/rate limiters route on headers, not JSON body

### Cacheable List Results

- `tools/list`, `prompts/list`, `resources/list`, `resources/read` carry `ttlMs` and `cacheScope`
- Clients can cache tool catalogs

### Other

- Authorization: RFC 9207 `iss` validation, DCR deprecated in favor of CIMD
- Tasks move to `io.modelcontextprotocol/tasks` extension
- Sampling, Roots, Logging deprecated (SEP-2577)
- JSON Schema 2020-12 now default

## TypeScript SDK v2 Changes

### Package Split

- v1: `@modelcontextprotocol/sdk` (monolithic, subpath imports)
- v2: `@modelcontextprotocol/server` + `@modelcontextprotocol/client`
- Optional middleware: `@modelcontextprotocol/express`, `/fastify`, `/hono`, `/node`

### Server API Changes

| v1 | v2 |
| --- | --- |
| `server.connect(new StdioServerTransport())` | `serveStdio(() => buildServer())` from `@modelcontextprotocol/server/stdio` |
| `inputSchema: { url: z.url() }` (bare shapes) | `inputSchema: z.object({ url: z.url() })` (Standard Schema) |
| `extra` handler param | `ctx` handler param |
| `McpServer(name, ver, { capabilities })` | `McpServer({ name, version })` — no capabilities arg |
| JSON Schema draft-07 by default | JSON Schema 2020-12 by default |
| `toJsonSchemaCompat` / `normalizeObjectSchema` | SDK handles conversion internally |

### Stdio: serveStdio()

- Hand-constructed `McpServer` + `StdioServerTransport` speaks 2025-era only
- For 2026-07-28: `serveStdio(() => buildServer())` selects era per connection
- Per-request identity via `ctx.mcpReq.envelope`, NOT `getClientCapabilities()`

### Requirements

- Node ≥ 22.19 (mnemonic: v25.2.1 ✅)
- Zod ≥ 4.2.0 (mnemonic: v4.3.6 ✅)
- TypeScript ≥ 6 (mnemonic: TS6 ✅)

## Impact on Mnemonic

### Direct Benefits

1. **Remove `tools/list` override** — the `_registeredTools` + `internalServer.setRequestHandler` hack goes away (~50 lines)
2. **Cache hints** — add `ttlMs`/`cacheScope` to tool list responses (28 tools, agents re-request frequently)
3. **Cleaner entrypoint** — no SDK-internal hackery
4. **Future-proof** — v2 is the stable release line

### Files to Change

- `src/index.ts` — major: imports, McpServer constructor, remove tools/list override
- `src/startup.ts` — `serveStdio()` instead of `StdioServerTransport` + `server.connect()`
- `src/context.ts` / `src/server-context.ts` — type updates
- `src/tools/*.ts` (29 files) — `inputSchema` wrapping, `extra`→`ctx`
- `src/prompts.ts` — `argsSchema` wrapping
- `tests/helpers/mcp.ts` — initialize handshake changes
- `tests/helpers/mcp-schema-client.ts` — tools/list response shape
- `package.json` — dependency swap

### Backward Compatibility

- v2 SDK handles legacy clients transparently (auto-negotiates era)
- v2 server still accepts v1 clients via legacy shim
- No flag day needed

## External Confirmation

- C# SDK v2 confirms backward-compatible-by-design pattern
- AWS AgentCore confirms "designed to be the last revision that breaks compatibility"
- Migration is opt-in — nothing breaks on July 28
