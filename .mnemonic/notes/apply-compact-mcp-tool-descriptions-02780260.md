---
title: 'Apply: Compact MCP Tool Descriptions'
tags:
  - workflow
  - apply
lifecycle: temporary
createdAt: '2026-05-11T17:51:44.944Z'
updatedAt: '2026-05-12T20:26:58.643Z'
role: context
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: plan-compact-mcp-tool-descriptions-c35d8705
    type: derives-from
  - id: plan-advisory-memory-health-diagnostics-from-microsoft-memor-a0aa3e62
    type: related-to
memoryVersion: 1
---
# Apply: Compact MCP Tool Descriptions

## What changed

Applied six compaction rules to all 23 tool registrations and shared projectParam.

## Before/After

- Tool descriptions: 14,817 → 11,754 chars (20.7% savings)
- Inline cwd describes: 1,197 → 804 chars (32.8% savings)
- projectParam cwd: 172 → 139 chars (19.2% savings)
- Total: 16,186 → 12,697 chars (21.6% savings)
- Tokens (~4c/t): ~4,047 → ~3,175 (~872 tokens, 21.5% reduction)

## Transformations applied

- T1: Returns bullets → terse field-name comma list
- T2: "Read-only." prose → dropped (annotations cover it)
- T3: Side effects prose → `[mutating: ...]` bracket tag
- T4: Redundant lead sentences → dropped or merged into Use-when
- T5: cwd param 157→119 chars (shared + 6 inline)
- T6: Recall 8-bullet Returns → compact field list with diagnostic names

## Preserved (not changed)

- Typical next step on all tools
- Use when / Do not use routing guards
- Prerequisite guards (REQUIRES on remember, "Use after" on update/consolidate/move-memory)
- All 4 diagnostic field names in recall (recallScopeNoteCount, diversity, retrievalCoverage, signalStrength)
- semanticPatch hint on update
- Evidence defaults note on consolidate

## Validation

- `npx tsc --noEmit` — passes clean
- `npm test` — 51 files, 873 tests pass

## Review outcome: PASS

All 15 constraints verified by fresh-context reviewer:

- 23/23 tools have Typical next step, Use when, Do not use
- Prerequisite guards intact on remember, update, consolidate, move-memory
- All 4 recall diagnostic names present
- No stale "Read-only." or "Side effects:" prose leaked through
- No old 157-char cwd text remains
- Compilation and tests clean

## Files changed (22 files)

- src/helpers/project.ts (projectParam cwd)
- src/tools/recall.ts, remember.ts, update.ts, consolidate.ts, discover-tags.ts, get.ts, forget.ts, relate.ts, unrelate.ts, list.ts, sync.ts, memory-graph.ts, recent-memories.ts, where-is-memory.ts, move-memory.ts, detect-project.ts, get-project-identity.ts, set-project-identity.ts, policy.ts, migration.ts, project-memory-summary.ts

## Not yet done (out of scope)

- AGENT.md, README.md, docs/index.html doc sync
