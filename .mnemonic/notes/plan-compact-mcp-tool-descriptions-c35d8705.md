---
title: 'Plan: Compact MCP Tool Descriptions'
tags:
  - workflow
  - plan
lifecycle: temporary
createdAt: '2026-05-11T17:36:36.041Z'
updatedAt: '2026-05-11T17:36:47.366Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: compact-mcp-tool-descriptions-reduce-context-window-footprin-05bd0fc5
    type: derives-from
memoryVersion: 1
---
# Plan: Compact MCP Tool Descriptions

## Scope

Apply six mechanical compaction rules to all 23 tool registrations in src/tools/*.ts and the shared projectParam in src/helpers/project.ts.

## Execution order

- [ ] Step 1: Shorten projectParam cwd description in src/helpers/project.ts
- [ ] Step 2: Shorten 6 inline cwd descriptions (detect-project, get/set-project-identity, policy x2, project-memory-summary)
- [ ] Step 3: Compact recall.ts description (biggest single win ~940 chars)
- [ ] Step 4: Compact discover-tags.ts (~444 chars)
- [ ] Step 5: Compact remember.ts (~235 chars)
- [ ] Step 6: Compact update.ts (~210 chars)
- [ ] Step 7: Compact consolidate.ts (~237 chars)
- [ ] Step 8: Compact move-memory.ts (~228 chars)
- [ ] Step 9: Compact get.ts (~170 chars)
- [ ] Step 10: Compact forget.ts (~140 chars)
- [ ] Step 11: Compact relate.ts (~160 chars)
- [ ] Step 12: Compact unrelate.ts (~120 chars)
- [ ] Step 13: Compact list.ts (~140 chars)
- [ ] Step 14: Compact sync.ts (~120 chars)
- [ ] Step 15: Compact memory-graph.ts (~110 chars)
- [ ] Step 16: Compact recent-memories.ts (~110 chars)
- [ ] Step 17: Compact project-memory-summary.ts (~140 chars)
- [ ] Step 18: Compact where-is-memory.ts (~110 chars)
- [ ] Step 19: Compact detect-project.ts (~100 chars)
- [ ] Step 20: Compact get-project-identity.ts, set-project-identity.ts, policy.ts (2 tools), migration.ts (2 tools)
- [ ] Step 21: Run TypeScript compilation
- [ ] Step 22: Run tests
- [ ] Step 23: Measure final char/token counts

## Transformation rules (applied to every tool)

### T1: Returns bullets → terse field-name list

Before: `Returns:\n- Bullet 1: explanation\n- Bullet 2: explanation`
After: `Returns: field1, field2, field3.`
Exception: keep one-line mention for text-only fields not in Zod.

### T2: "Read-only." → drop entirely

MCP `readOnlyHint: true` annotation covers it.

### T3: Side effects → terse mutation tag

Before: `Side effects: writes a note, writes embeddings, git commits, and may push.`
After: `[mutating: writes note, embeddings, git commits, may push]`

### T4: Redundant lead sentence → merge into first Use-when

Drop standalone lead sentence when first Use-when bullet already communicates purpose.

### T5: cwd param shorten

Before: `Absolute project working directory. Pass this whenever the task is project-related so routing, search boosting, policy, and vault selection work correctly.` (157 chars)
After: `Absolute path of the project working directory. Required for project-scoped routing, vault selection, and search boosting.` (119 chars)

### T6: Recall-specific compression

8 verbose Returns bullets → compact field list naming all four diagnostic fields.

## Constraints

- NEVER remove Typical next step lines
- NEVER remove Use when / Do not use routing guards
- NEVER remove prerequisite guards (REQUIRES, "Use after ...")
- Keep field names in compact Returns so weaker models still see them
- recall.ts must still name recallScopeNoteCount, diversity, retrievalCoverage, signalStrength
- remember.ts must keep REQUIRES guard
- Do NOT change AGENT.md, README.md, docs/index.html in this pass

## Validation

- `npx tsc --noEmit` passes
- `npm test` passes
- Measure before/after char and token counts
