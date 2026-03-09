---
title: >-
  Agent instruction improvements: session start, recall-first, and consolidation
  hygiene
tags:
  - agent-instructions
  - system-prompt
  - consolidate
  - documentation
  - workflow
lifecycle: permanent
createdAt: '2026-03-08T09:52:09.787Z'
updatedAt: '2026-03-08T09:52:24.892Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: documentation-split-for-readme-architecture-and-agent-4e20a50b
    type: related-to
  - id: mnemonic-consolidate-tool-design-b9cbac6a
    type: example-of
memoryVersion: 1
---
Added three missing workflow patterns to the agent instructions in `AGENT.md`, `README.md`, and `docs/index.html`.

## What was missing

The instructions told agents *when* to capture but gave no guidance on:

- How to orient at the start of a session
- How to avoid accumulating fragmented notes on the same topic
- When and how to consolidate

## Changes made

### Session start (all three files)

Added `project_memory_summary` as the preferred first call (richer than a bare `recall`), with `recall` as the alternative. Steps are now:

1. `detect_project`
2. `project_memory_summary` with `cwd` (or `recall` with broad query)
3. `recall` if something is unrecognized

### Before calling `remember` (all three files)

Added an explicit "recall-first" rule: do a quick `recall` before `remember`. If a related note exists, `update` it instead. This prevents the natural accumulation of fragmented notes when an agent captures incrementally over multiple sessions.

### Memory hygiene / consolidation triggers (all three files)

Added consolidation triggers:

- 3+ notes on the same topic accumulated
- Feature or bug arc is complete, captures can be synthesized
- `memory_graph` shows a dense cluster of tightly-related nodes

Clarified the two consolidation modes:

- `supersedes` (default): preserves history, sources cleanable later via `prune-superseded` strategy
- `delete`: removes sources immediately

### `prune` tool table correction (AGENT.md only)

Removed `prune` as a standalone row from the tools table — it does not exist as an independent MCP tool. It is the `prune-superseded` strategy of `consolidate`. Fixed the commit conventions table to reflect `consolidate (prune-superseded)` as the emitter of `prune:` commits.

## Why the recall-first rule matters

Without it, agents naturally default to `remember` for every new observation, even when an update to an existing note would be more accurate. The fragmentation is invisible until the vault has dozens of near-duplicate notes on the same topic, which is exactly what `consolidate` has to clean up retroactively.

The better default is: recall → update if related exists, remember if truly new, consolidate after accumulation.
