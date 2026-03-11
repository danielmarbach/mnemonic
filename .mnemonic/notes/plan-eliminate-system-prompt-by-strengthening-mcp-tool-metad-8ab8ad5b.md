---
title: 'Plan: Eliminate system prompt by strengthening MCP tool metadata'
tags:
  - plan
  - architecture
  - mcp
  - system-prompt
lifecycle: temporary
createdAt: '2026-03-11T22:15:05.636Z'
updatedAt: '2026-03-11T22:15:05.636Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Goal: Make mnemonic MCP self-contained by moving guidance from SYSTEM_PROMPT.md into tool descriptions, annotations, and schemas. Reduce system prompt to minimal cross-tool policy only.

## Steps

### Step 1: Add ToolAnnotations to all 22 tools

Classify each tool with readOnlyHint, destructiveHint, idempotentHint, openWorldHint.

Read-only tools: detect_project, get_project_identity, get_project_memory_policy, recall, get, list, recent_memories, memory_graph, project_memory_summary, where_is_memory, list_migrations
Mutating (non-destructive): remember, update, set_project_memory_policy, set_project_identity, relate, move_memory, execute_migration, consolidate
Mutating (destructive): forget, unrelate
Open-world: sync (interacts with git remote + Ollama)

### Step 2: Rewrite tool descriptions with decision boundaries

Use pattern: purpose → use-when → do-not-use-when → notes (side effects, follow-up tools)

Key absorptions from SYSTEM_PROMPT.md:

- remember: absorb lifecycle guidance, summary quality, dedup-before-write hint, relationship check hint
- recall: absorb session-start usage, project-boost explanation
- update: absorb "prefer update over remember when note exists"
- forget: absorb "only when fully superseded and confusing"
- consolidate: absorb modes, workflow, when-to-use
- relate: absorb relationship type guidance table
- detect_project: absorb "call first in every session"
- project_memory_summary: absorb "use to orient at session start"

### Step 3: Strengthen parameter descriptions

- projectParam (cwd): add "sets project association for routing and boosting; omit only for truly cross-project memories"
- remember.content: add "write summary-first; key fact in opening sentences"
- remember.lifecycle: expand with examples of temporary vs permanent
- remember.summary: add "imperative mood, 50-72 chars, explain why not what"

### Step 4: Reduce SYSTEM_PROMPT.md to cross-tool policy only

Keep only:

- Session start sequence (detect_project → summary → recall)
- Deduplication workflow (recall → update vs remember routing)
- Relationship creation after remember
- Scoping rules (cwd presence/absence)
These are genuinely cross-tool orchestration rules.

### Step 5: Update docs

- AGENT.md: remove redundant tool guidance that's now in descriptions
- README.md: note that system prompt is optional/minimal
- SYSTEM_PROMPT.md: rewrite to ~20-30 lines

## Pushback notes

- Cannot fully eliminate system prompt: session-start sequence and dedup-before-write are cross-tool
- But can reduce from 140 lines to ~20-30 lines
- Tool descriptions are the highest ROI lever
