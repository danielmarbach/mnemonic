---
title: MCP prompt for cross-tool workflow guidance instead of system prompt injection
tags:
  - mcp
  - prompt
  - workflow
  - architecture
  - decision
lifecycle: permanent
createdAt: '2026-03-14T14:45:16.894Z'
updatedAt: '2026-03-24T10:55:20.655Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mnemonic-key-design-decisions-3f2a6273
    type: related-to
  - id: mnemonic-mcp-tools-inventory-47499799
    type: related-to
  - id: mcp-workflow-ux-hint-prompt-tool-descriptions-and-session-st-e89a18fc
    type: supersedes
memoryVersion: 1
---
Added `mnemonic-workflow-hint` as an optional MCP prompt (via `server.registerPrompt`) to surface cross-tool workflow guidance without bloating individual tool descriptions.

## Decision

Individual tool descriptions are self-contained but can't easily convey multi-step workflow patterns (discover → inspect → modify → organize) or the storage-label model. An MCP prompt is the right place for this: it is opt-in, not auto-injected, and lives at the right abstraction level.

## 2026-03-19 Update: Strengthened for weaker MCP models

Claude and Codex followed workflow hints from AGENT.md, but GLM-5/minimax missed the discover → inspect → modify → organize pattern. Changes:

### Tool descriptions now have top-positioned prerequisites

- `remember`: **"REQUIRES: Call `recall` or `list` first to check whether this memory already exists."** at the very top
- `update`: "Use after `recall` + `get` when an existing memory should be refined instead of creating a duplicate."
- `get`: "Use after `recall`, `list`, or `recent_memories` when you need the full note content."
- `move_memory`: "Use after `where_is_memory` or `get` confirms a memory is stored in the wrong place."
- `relate`: "Use after you have identified the exact memories to connect."
- `consolidate`: "Use after `recall`, `list`, or `memory_graph` shows overlap that should be merged or cleaned up."

The key insight: putting prerequisites at the TOP of descriptions (not buried in "Do not use when" lists) makes them more visible during tool lookup. Using "REQUIRES:" in `remember` creates a hard imperative framing.

### Prompt restructured from gentle workflow to imperative rules

**Before:** "Typical memory workflow" with numbered phases (gentle guidance)

**After:** Three explicit sections:

1. **Hard rules** - "REQUIRES: Before `remember`, call `recall` first." and explicit decision logic
2. **Decision protocol** - Numbered steps with clear conditions
3. **Anti-patterns** - "Bad: call `remember` immediately because the user said 'remember'. Good: `recall` first, then `get`, then `update` or `remember`."

Plus "Tiny examples" showing concrete decision paths.

Rationale: GLM-5/minimax respond better to explicit imperatives ("REQUIRES:", "Bad:", "Good:") than gentle guidance. The anti-pattern section directly addresses the common failure mode of jumping to `remember` without checking for existing memories.

## What it covers

- Four-phase workflow: `recall` → `get` → `update`/`remember` → `relate`/`consolidate`/`move`
- Storage model labels: `main-vault`, `project-vault`, `sub-vault:<folder>`
- Why `cwd` matters (routing, recall ranking, policy lookup)
- Explicit anti-pattern: avoid duplicate `remember` when `update` suffices
- Hard imperative rules for weaker models that miss gentle guidance

## Why not auto-inject

MCP clients can include it on demand. Auto-injection would add tokens on every request even when the agent already knows the workflow from AGENT.md or prior context.

## Registration pattern

```typescript
server.registerPrompt("mnemonic-workflow-hint", { title: "...", description: "..." }, async () => ({
  messages: [{ role: "user", content: { type: "text", text: "..." } }]
}));
```

Registered just before `server.connect()`, after all tool registrations.
