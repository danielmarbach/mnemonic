---
title: list_migrations structured content schema mismatch fixed
tags:
  - bug
  - migration
  - mcp
  - schema
  - fixed
lifecycle: permanent
createdAt: '2026-03-11T14:53:29.987Z'
updatedAt: '2026-03-11T15:00:05.595Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Resolved bug: `list_migrations` was failing because its handler returned a field that the declared structured output schema did not allow.

## Root cause

The tool handler returned:

- `action`
- `vaults`
- `available`
- `totalPending`

But `MigrationListResultSchema` only declared:

- `action`
- `vaults`
- `available`

That mismatch caused MCP validation to fail with:
`Structured content does not match the tool's output schema: data must NOT have additional properties`

## Fix

Added `totalPending: number` to both the TypeScript `MigrationListResult` type and `MigrationListResultSchema` so the schema matches the actual handler output.

## Verification

- added an MCP integration test for `list_migrations`
- added a schema-audit style integration test that parses `list_migrations`, `execute_migration`, and `memory_graph` structured outputs with their zod schemas
- full `tests/mcp.integration.test.ts` passes after the fix

## Relationship to the earlier memory_graph issue

This is related in category, but not the same root cause:

- `list_migrations`: handler/schema drift
- `memory_graph`: persisted legacy data (`relates-to`) violating the current schema enum

This note supersedes the earlier temporary bug report and records the actual cause and fix.
