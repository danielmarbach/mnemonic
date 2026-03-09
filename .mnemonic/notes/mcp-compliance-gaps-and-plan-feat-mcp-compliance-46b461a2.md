---
title: MCP compliance gaps and plan — feat/mcp-compliance
tags:
  - plan
  - mcp-compliance
  - outputSchema
  - wip
createdAt: '2026-03-09T18:15:14.121Z'
updatedAt: '2026-03-09T18:15:14.121Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
## Goal

Bring the mnemonic MCP server into compliance with the MCP implementation standards on branch `feat/mcp-compliance`.

## Already compliant

- `McpServer` class, server name + version set
- `StdioServerTransport`
- `registerTool()` with `title`, `description`, and `inputSchema` (zod) on all tools
- All tools return both `content` and `structuredContent` on happy paths
- TypeScript, async/await, env vars, inline comments

## Gaps (minimum required work)

### 1. Add `outputSchema` to all tool registrations — highest priority

The standard requires "Define schemas using zod for input AND output validation." The `registerTool()` API supports an `outputSchema` parameter that validates `structuredContent`. None of the ~20 tools currently pass `outputSchema`.

The TypeScript interfaces already exist in `src/structured-content.ts`. The work is to add corresponding zod schemas (in `src/structured-content.ts` or a new `src/output-schemas.ts`) and wire each into the matching `registerTool()` call as `outputSchema`.

Tools and their result types: `remember` → `RememberResult`, `recall` → `RecallResult`, `list` → `ListResult`, `get` → `GetResult`, `update` → `UpdateResult`, `forget` → `ForgetResult`, `move_memory` → `MoveResult`, `relate`/`unrelate` → `RelateResult`, `recent_memories` → `RecentResult`, `where_is_memory` → `WhereIsResult`, `memory_graph` → `MemoryGraphResult`, `project_memory_summary` → `ProjectSummaryResult`, `sync` → `SyncResult`, `reindex` → `ReindexResult`, `set_project_memory_policy`/`get_project_memory_policy` → `PolicyResult`, `detect_project`/`get_project_identity`/`set_project_identity` → `ProjectIdentityResult`, `list_migrations` → `MigrationListResult`, `execute_migration` → `MigrationExecuteResult`, `consolidate` → `ConsolidateResult`.

### 2. Add transport close event cleanup

Standard: "Implement proper cleanup on transport close events." Currently the server does `server.connect(transport)` with no cleanup handler. Add a `transport.onclose` (or equivalent SDK hook) to gracefully shut down.

### 3. Add `structuredContent` to error/early-exit paths

Standard: "Return both `content` and `structuredContent` in results." Several not-found / early-exit returns only return `content`. These should include a minimal structuredContent (e.g. `{ action: "error", message: "..." }`).

## Approach

1. Implement gap 1 first — most impactful, drives MCP client tooling
2. Gap 2 — one-liner at startup
3. Gap 3 — sweep through error paths
4. Run `npm test` after each step
5. Dogfood via `npm run mcp:local` before merging
