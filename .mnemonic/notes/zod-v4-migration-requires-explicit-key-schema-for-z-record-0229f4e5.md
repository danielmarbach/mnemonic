---
title: Zod v4 migration requires explicit key schema for z.record
tags:
  - zod
  - dependency-upgrade
  - schema
  - typescript
  - mcp
lifecycle: permanent
createdAt: '2026-03-11T20:51:09.845Z'
updatedAt: '2026-05-09T21:10:39.017Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mnemonic-key-design-decisions-3f2a6273
    type: related-to
memoryVersion: 1
---
Zod v4 requires explicit key schema for `z.record`, which caused a TypeScript build failure (`TS2554`) after dependency installation even though tests initially passed with a stale v3 install.

In `src/structured-content.ts`, `themes: z.record(z.number())` had to be updated to `themes: z.record(z.string(), z.number())` to satisfy the new v4 signature and preserve intent (string-keyed map of theme counts).

Why this matters in mnemonic architecture:

- Zod schemas are used as MCP tool contract boundaries (input/output schema validation).
- Structured output shape drift or schema incompatibilities break tool reliability and can fail MCP responses.
- Dependency upgrades should be validated with a real install + typecheck/build, not only test runs, because stale `node_modules` can mask migration issues.
