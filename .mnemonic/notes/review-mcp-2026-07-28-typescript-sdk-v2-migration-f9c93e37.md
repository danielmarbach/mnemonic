---
title: 'Review: MCP 2026-07-28 + TypeScript SDK v2 migration'
tags:
  - rpir
  - workflow
  - review
  - mcp-2026-07-28
lifecycle: temporary
createdAt: '2026-08-01T11:00:32.902Z'
updatedAt: '2026-08-01T11:00:32.902Z'
role: review
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
# Review: MCP 2026-07-28 + TypeScript SDK v2 Migration

## Summary

Successfully migrated mnemonic from `@modelcontextprotocol/sdk` v1.30.0 to `@modelcontextprotocol/server` v2.0.0. Net reduction of 974 lines. All 1305 tests + dogfooding pass.

## What Changed

### Removed (~54 lines)

- `tools/list` JSON Schema 2020-12 override (`_registeredTools` + `internalServer.setRequestHandler` hack)
- `toJsonSchemaCompat`, `normalizeObjectSchema`, `ListToolsRequestSchema` imports

### Changed

- 31 files: import `@modelcontextprotocol/sdk/server/mcp.js` → `@modelcontextprotocol/server`
- `src/startup.ts`: `server.connect(new StdioServerTransport())` → `serveStdio(() => server)`
- `src/index.ts`: `McpServer` constructor format, added `cacheHints`
- `package.json`: removed `@modelcontextprotocol/sdk` v1.x dependency

### Added

- `cacheHints` on `tools/list`: 1-hour TTL, private cache scope
- CHANGELOG entry
- ARCHITECTURE.md updates

## What Didn't Need Changing

- `inputSchema` wrapping — already `z.object({...})` from Zod v4 migration
- `extra` → `ctx` — no tool used the handler context parameter
- `prompts.ts` — no `argsSchema` to wrap
- Test helpers — legacy shim in `serveStdio()` handles `initialize` handshake transparently
- Dogfood scripts — same, legacy shim transparent

## Verification

- `npm test`: 1305/1305 pass, 75 test files ✅
- `npm run dogfood:isolated`: passes ✅
- `npx tsc --noEmit`: clean ✅
- `npm run build:fast`: clean ✅
- `npm run lint`: clean ✅
- `npm run format:check`: clean ✅
- Pre-commit hooks: all passed ✅

## Design Constraints Compliance

- File-first, git-backed — unchanged ✅
- Fail-soft to undefined — unchanged ✅
- No new I/O on cold paths — unchanged ✅
- Structured output contract preserved ✅
- Changelog curated ✅
- Docs synced ✅

## Residual Notes

- Two tests (`sync-migrations`, `writable-attachment`) can fail under high parallelism but pass in isolation — pre-existing flakiness, not SDK-related
- `@modelcontextprotocol/sdk` removed from dependencies; Renovate will no longer attempt v1 updates

## Memory Updates

- `mnemonic-project-overview-and-purpose-763b7a51` — updated SDK reference
- `mnemonic-source-file-layout-4d11294d` — updated source layout for v2
