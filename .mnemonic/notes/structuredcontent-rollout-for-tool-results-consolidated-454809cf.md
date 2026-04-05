---
title: structuredContent rollout for tool results (consolidated)
tags:
  - mcp
  - structured-content
  - api-design
  - completed
  - structured-data
lifecycle: permanent
createdAt: '2026-04-05T12:36:49.594Z'
updatedAt: '2026-04-05T12:36:49.594Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Consolidate the temporary structured-content follow-up checkpoint into the canonical rollout memory now that the deferred API cleanup has been implemented and verified.

structuredContent was rolled out for mnemonic tool results to make responses semantically richer and more reliable for LLM and UI clients, and the later cleanup pass finished the remaining contract-consistency work.

Durable outcome:
- Tool responses should include both human-readable text and typed `structuredContent`.
- Affected MCP results now use a consistent `project: { id, name }` shape instead of mixing object and `project`/`projectName` string pairs.
- `get` now exposes persisted `alwaysLoad` metadata in structured output so the typed note view better matches stored note state.
- Targeted schema-audit integration coverage now guards this regression class for the high-risk result paths touched by the cleanup.

Key implementation points:
- Added shared structured-content typing support and rolled it across core memory operations and subsequent tools including `get`.
- Preserved human-readable text output alongside typed structured metadata.
- Completed the deferred follow-up by normalizing project identity shape, surfacing `alwaysLoad`, and adding parse-based schema-audit coverage.
- Legacy notes missing `projectName` stay honest in typed output rather than fabricating a display name.

This note is the canonical memory for the structuredContent rollout and its follow-up contract cleanup; the old checkpoint remains preserved via superseded relationships rather than as a separate active resume note.
