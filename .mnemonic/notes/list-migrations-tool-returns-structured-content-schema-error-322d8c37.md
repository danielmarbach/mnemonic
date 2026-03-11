---
title: list_migrations tool returns structured content schema error
tags:
  - bug
  - migration
  - mcp
  - temporary
  - schema
lifecycle: temporary
createdAt: '2026-03-11T14:53:29.987Z'
updatedAt: '2026-03-11T14:53:29.987Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Observed bug: `mnemonic_list_migrations` fails instead of returning the migration list.

## Symptom

Calling the tool returned:
`McpError: MCP error -32602: Structured content does not match the tool's output schema: data must NOT have additional properties`

## Impact

- Users cannot rely on the MCP tool to inspect available or pending migrations.
- Agents must fall back to reading `src/migration.ts` directly to determine registered migrations.

## Context

Observed on 2026-03-11 while trying to list migrations for the mnemonic project vault.

## Likely area to inspect

- the `list_migrations` tool handler output in `src/index.ts`
- the structured content schema for the tool response
- any extra fields returned beyond the declared schema

This should be treated as a temporary bug/investigation note until the handler and schema are aligned.
