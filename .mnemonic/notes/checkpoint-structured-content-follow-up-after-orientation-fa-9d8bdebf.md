---
title: 'Checkpoint: structured content follow-up after orientation fallback fix'
tags:
  - structured-content
  - checkpoint
  - api-design
  - schema
lifecycle: temporary
createdAt: '2026-04-05T10:56:31.566Z'
updatedAt: '2026-04-05T10:57:18.662Z'
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: structuredcontent-rollout-for-tool-results-consolidated-886a1f12
    type: explains
memoryVersion: 1
---
Structured-content follow-up can be implemented later in a separate change; it is not required to complete the Phase 2 orientation fallback work on `checkpoint`.

## Why it is separate

The branch fix restored `project_memory_summary` behavior: orientation stays permanent-first and temporary notes remain in the working-state/recovery layer. The follow-up review identified broader API consistency work rather than a bug in the current feature.

## Follow-up items

1. Standardize project identity in structured content to a canonical object shape such as `{ id, name }` across tool results instead of mixing object and `project`/`projectName` string pairs.
2. Make `get` the authoritative typed view of note metadata by exposing persisted fields such as `alwaysLoad` in `GetResult` structured content.
3. Expand schema-audit coverage for result types that currently define schemas but are not consistently validated by parse-based MCP integration tests.

## Review findings behind this checkpoint

- Structured content broadly follows the rollout principle of returning both human-readable text and typed payloads.
- The main gap is contract consistency across tools, especially around project identity.
- `get` currently omits `alwaysLoad`, which leaves meaningful persisted note metadata outside the typed contract.
- Audit coverage is uneven; some result schemas are parsed in integration tests, others are not.

## Resume hint

Implement this as a separate branch or later commit after the current bugfix work is considered complete. Treat it as structured-content/API cleanup with compatibility considerations, not as part of the orientation fallback bugfix.
ugfix.
