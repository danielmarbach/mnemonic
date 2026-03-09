---
title: Add structuredContent to Tool Results
tags:
  - mcp
  - structured-data
  - api-design
  - p0-immediate
lifecycle: permanent
createdAt: '2026-03-08T14:25:52.433Z'
updatedAt: '2026-03-08T14:25:52.433Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
## Priority P0 - Add structuredContent to All Tool Results

All 23 tools currently return only text content. Add structuredContent field with typed metadata for each tool:

- remember: { id, title, project, scope, vault, tags, timestamp }
- recall: { query, results: [{ id, title, score, project, vault }] }
- list: { count, notes: [{ id, title, project, tags, updated }] }
- get: { notes: [...], notFound: [...] }
- relate/unrelate: { fromId, toId, type, bidirectional, notesModified }
- move_memory: { id, fromVault, toVault, projectAssociation }
- consolidate: { strategy, project, notesProcessed, notesModified, warnings }
- sync/reindex: { vaults: [{ vault, rebuilt, failed }] }

Benefits: LLM reliability, UI client support, programmatic access, type safety, backward compatible

Implementation: 2-3 days to update all tools, 1 day testing. Effort: 3-4 days total.
