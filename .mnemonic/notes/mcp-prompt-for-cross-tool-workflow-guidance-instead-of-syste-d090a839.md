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
updatedAt: '2026-03-14T15:01:15.669Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mnemonic-key-design-decisions-3f2a6273
    type: related-to
memoryVersion: 1
---
Added `mnemonic-workflow-hint` as an optional MCP prompt (via `server.registerPrompt`) to surface cross-tool workflow guidance without bloating individual tool descriptions.

## Decision

Individual tool descriptions are self-contained but can't easily convey multi-step workflow patterns (discover → inspect → modify → organize) or the storage-label model. An MCP prompt is the right place for this: it is opt-in, not auto-injected, and lives at the right abstraction level.

## What it covers

- Four-phase workflow: `recall` → `get` → `update`/`remember` → `relate`/`consolidate`/`move`
- Storage model labels: `main-vault`, `project-vault`, `sub-vault:<folder>`
- Why `cwd` matters (routing, recall ranking, policy lookup)
- Explicit anti-pattern: avoid duplicate `remember` when `update` suffices

## Why not auto-inject

MCP clients can include it on demand. Auto-injection would add tokens on every request even when the agent already knows the workflow from AGENT.md or prior context.

## Registration pattern

```typescript
server.registerPrompt("mnemonic-workflow-hint", { title: "...", description: "..." }, async () => ({
  messages: [{ role: "user", content: { type: "text", text: "..." } }]
}));
```

Registered just before `server.connect()`, after all tool registrations.
