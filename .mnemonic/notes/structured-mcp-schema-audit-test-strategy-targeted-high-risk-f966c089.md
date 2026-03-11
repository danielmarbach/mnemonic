---
title: >-
  Structured MCP schema-audit test strategy: targeted high-risk coverage over
  exhaustive per-tool tests
tags:
  - testing
  - mcp
  - structured-content
  - schema
  - decision
lifecycle: permanent
createdAt: '2026-03-11T15:11:28.262Z'
updatedAt: '2026-03-11T15:11:28.262Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Decision: use targeted schema-audit integration tests for high-risk MCP tools instead of requiring a bespoke schema-parsing test for every single tool immediately.

## Why this tradeoff

Every tool with both runtime `structuredContent` and a declared zod `outputSchema` is vulnerable to drift between handler output, schema declarations, and persisted/runtime data. The recently observed failures showed two variants of the same broad risk class:

- handler/schema drift (`list_migrations` returned `totalPending`, but the schema omitted it)
- persisted-data/schema drift (`memory_graph` can fail when legacy stored relation types violate the current enum schema)

So schema-audit tests are valuable, but exhaustive one-off tests for every tool would add a lot of maintenance overhead for limited immediate benefit.

## Chosen approach

Adopt schema-audit tests as a standard pattern, but prioritize them for tools that are either:

- high churn
- storage/history sensitive
- likely to surface structured-content regressions with user-visible failures

Current priority set:

- `list_migrations`
- `execute_migration`
- `memory_graph`
- `consolidate`
- `sync`
- persistence-heavy mutation tools

## Testing pattern

Prefer schema-audit integration tests that:

- invoke the real MCP tool through the local entrypoint
- parse the returned `structuredContent` with the exported zod schema
- use hermetic CI-safe fixtures (temp vault, fake Ollama endpoint, git disabled unless explicitly needed)

This catches both accidental schema shape drift and runtime data incompatibilities without needing to duplicate all assertions manually.

## Practical guidance

- When changing a tool's `structuredContent` shape or `outputSchema`, update or add a schema-audit test in the same change.
- Expand schema-audit coverage incrementally as tools evolve, rather than trying to create exhaustive coverage for every tool in one pass.
- Use full bespoke behavioral assertions where the tool has important semantics beyond shape validation; use schema-audit parsing as the minimum guardrail for structured-output integrity.

This keeps the maintenance cost proportional while still guarding the regression class that caused the recent MCP validation bugs.
