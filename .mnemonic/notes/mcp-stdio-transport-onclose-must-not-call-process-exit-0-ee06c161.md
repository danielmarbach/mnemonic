---
title: 'MCP stdio transport: onclose must not call process.exit(0)'
tags:
  - mcp
  - transport
  - process.exit
  - async
  - decision
createdAt: '2026-03-09T19:34:21.754Z'
updatedAt: '2026-03-09T19:34:21.754Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
## Decision

`transport.onclose` must not call `process.exit(0)` directly. Use `server.close()` instead and let Node exit naturally.

## Why

Calling `process.exit(0)` from `transport.onclose` races with in-flight async tool handlers. When the client disconnects (stdin EOF), `onclose` fires before pending responses are written, killing the process mid-flight and losing the response.

## Correct pattern (src/index.ts)

```typescript
transport.onclose = async () => { await server.close(); };
```

Signal handlers (`SIGINT`, `SIGTERM`) should go through a `shutdown()` function that calls `server.close()` before exiting, giving async work a chance to finish.

## Context

Discovered during MCP compliance work on `feat/mcp-compliance` (commit 933af2b).
