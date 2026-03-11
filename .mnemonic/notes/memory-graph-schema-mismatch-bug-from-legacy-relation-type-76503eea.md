---
title: memory_graph schema mismatch bug from legacy relation type
tags:
  - bug
  - memory-graph
  - schema-migration
  - temporary
  - investigation
lifecycle: temporary
createdAt: '2026-03-11T14:36:21.383Z'
updatedAt: '2026-03-11T14:36:21.383Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
`memory_graph` currently fails with MCP output validation because some stored relationships still use the legacy type `relates-to`, while the current structured schema only accepts `related-to`, `explains`, `example-of`, and `supersedes`.

Why this matters:

- It exposes a gap in an older schema/data migration: stored relationship data can remain semantically valid enough for normal listing, but invalid for newer structured output contracts.
- It suggests there may be other historical enum/value migrations or stored-shape mismatches worth auditing.
- This should be treated as temporary investigation/fix work, not yet as a permanent architectural decision.

Observed symptom:

- `memory_graph` returns MCP validation error `invalid_enum_value` for `relates-to`.

Likely follow-up:

- add or run a migration that normalizes legacy relationship types
- audit for other persisted values that may violate current zod/structuredContent schemas
- consider defensive normalization on read for historical data
