---
title: 'Plan: Eliminate system prompt by strengthening MCP tool metadata'
tags:
  - plan
  - architecture
  - mcp
  - system-prompt
lifecycle: temporary
createdAt: '2026-03-11T22:15:05.636Z'
updatedAt: '2026-03-12T05:00:23.332Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Goal: Make mnemonic MCP self-contained by moving guidance from SYSTEM_PROMPT.md into tool descriptions, annotations, and schemas. Reduce system prompt to minimal cross-tool policy only.

## Status: Implementation complete

### Step 1: Add ToolAnnotations to all 22 tools — DONE

All tools classified with readOnlyHint, destructiveHint, idempotentHint, openWorldHint.

### Step 2: Rewrite tool descriptions with decision boundaries — DONE

All 22 tools rewritten with "Use this when" / "Do not use this when" / side effects / follow-up guidance.

### Step 3: Strengthen parameter descriptions — DONE

- projectParam (cwd): explains routing, boosting, project association vs storage
- remember.content: summary-first guidance, embedding weight note
- remember.lifecycle: examples of temporary vs permanent
- remember.summary: imperative mood, 50-72 chars, example
- remember.scope: explains project vs global vault
- All other tools: param descriptions improved

### Step 4: Reduce SYSTEM_PROMPT.md — DONE

Reduced from 141 lines to 26 lines (82% reduction). Keeps only:

- Session start sequence (detect_project → summary → recall)
- Deduplication workflow (recall before remember, update if exists)
- Relationship creation after remember
- Scoping rules (cwd presence/absence)

### Step 5: Update docs — DONE

- README.md: updated to note tools are self-describing, system prompt is optional
- docs/index.html: website snippet updated to match new minimal SYSTEM_PROMPT.md, marked as optional
- SYSTEM_PROMPT.md: rewritten to 26 lines

## Remaining

- AGENT.md may have redundant guidance that's now in tool descriptions (future cleanup)
- Integration tests (2 timeouts) are pre-existing flaky tests, not caused by changes
