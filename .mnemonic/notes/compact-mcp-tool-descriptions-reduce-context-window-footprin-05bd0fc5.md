---
title: Compact MCP tool descriptions — reduce context window footprint
tags:
  - workflow
  - request
lifecycle: temporary
createdAt: '2026-05-11T17:34:39.993Z'
updatedAt: '2026-05-11T17:36:47.366Z'
role: context
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: plan-compact-mcp-tool-descriptions-c35d8705
    type: derives-from
memoryVersion: 1
---
# Compact MCP Tool Descriptions

## Request

Reduce mnemonic MCP tool description context footprint from ~10K tokens. Current descriptions total ~15,062 chars (~3,766 tokens) for tool descriptions plus ~2,826 chars for repeated `cwd` param descriptions.

## Hard constraints (from previous iterations)

- **Typical next step** lines are load-bearing for weaker models — keep them
- **Use when / Do not use** routing guards are critical — keep them
- **Prerequisite guards** (e.g. REQUIRES on remember) — keep them
- Implementation principles note says Returns prose and Zod `.describe()` must both exist

## Safe-to-tighten transformations identified

1. **Returns bullets → terse field-name list**: Zod `.describe()` has per-field detail
2. **Side effects on read-only tools → drop**: `readOnlyHint: true` annotation covers it
3. **Side effects on mutating tools → terse tag**: `[mutating: ...]` bracket format
4. **Redundant lead sentence → merge into first Use-when**: Two lines saying the same thing
5. **cwd param description (18×) → shorten**: ~150 → ~80 chars
6. **Recall Returns (1840 chars) → compress**: 8 verbose bullets → compact field list

## Key files by impact

- recall.ts (1840 chars, biggest savings)
- discover-tags.ts (1044 chars)
- remember.ts (785), update.ts (821), consolidate.ts (887), move-memory.ts (908)

## Expected outcome

~3,000-4,000 chars saved (~750-1,000 tokens), ~25-30% reduction in description context.
