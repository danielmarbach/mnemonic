---
title: 'consolidate execute-merge: custom content body override'
tags:
  - consolidation
  - execute-merge
  - design
  - fix
  - mcp-tool
lifecycle: permanent
createdAt: '2026-03-09T11:56:33.647Z'
updatedAt: '2026-03-24T10:54:19.723Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: consolidate-tool-design-execute-merge-behavior-idempotency-a-0911e2cd
    type: supersedes
memoryVersion: 1
---
Added `content` field to `mergePlan` in the `consolidate` execute-merge strategy.

Problem: when consolidating temporary notes (e.g. a plan + outcome), the auto-merge always dumped ALL source content verbatim under `## Consolidated from:` headers. Working-state plan content ("Plan: do X, Y, Z...") ended up in the permanent consolidated note alongside the durable outcome content.

Fix: `mergePlan.content` is now an optional field. When provided, it replaces the auto-merged source content. Callers can distil only the durable knowledge into the consolidated note body, instead of preserving every source's content verbatim.

Behavior:

- `mergePlan.content` present: body = optional description + custom content (no `## Consolidated from:` block)
- `mergePlan.content` absent: existing behavior — description + `## Consolidated from:` block with all source content verbatim

When to use: always provide `content` when consolidating temporary notes whose sources contain working-state content (plans, WIP checklists) that should not persist in the permanent consolidated note.

Test: `uses custom content body when mergePlan.content is provided` in `tests/mcp.integration.test.ts`.

File: `src/index.ts` — `executeMerge` function and `mergePlan` zod schema.
