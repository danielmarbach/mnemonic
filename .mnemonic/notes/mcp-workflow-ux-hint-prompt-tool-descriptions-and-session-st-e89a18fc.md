---
title: 'MCP workflow UX: hint prompt, tool descriptions, and session-start orientation'
tags:
  - mcp
  - workflow
  - design
  - decision
lifecycle: permanent
createdAt: '2026-03-24T10:55:20.655Z'
updatedAt: '2026-04-26T10:08:02.412Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mnemonic-key-design-decisions-3f2a6273
    type: related-to
  - id: mnemonic-mcp-tools-inventory-47499799
    type: related-to
  - id: mnemonic-explicit-metadata-outranks-inferred-prioritization-6d3a6da0
    type: explains
  - id: mnemonic-language-independent-role-heuristics-f66619c1
    type: related-to
  - id: phase-2-design-workflow-hint-first-working-state-continuity-07153fcb
    type: related-to
  - id: rpir-workflow-design-for-mnemonic-research-plan-implement-re-80b00851
    type: related-to
memoryVersion: 1
---
## Decision: MCP prompt over system prompt injection

Workflow guidance moved from the system prompt into an on-demand MCP prompt (`mnemonic-workflow-hint`). Clients request it explicitly; it is never auto-injected.

**Rationale:** system prompt injection bloats every session with workflow prose regardless of whether the agent needs it. A requestable prompt keeps the system prompt lean and lets different client types opt in.

## Optimizing for weaker models

`mnemonic-workflow-hint` is written as a compact decision protocol rather than descriptive prose:

- Imperative rules first, with strong labels: `REQUIRES:`, `Before using this tool:`
- Core sequence explicit: `recall → get → update` when memory exists; `remember` only when nothing matches
- Uncertainty default: when unsure, prefer `recall` over `remember`
- `cwd` reminders explicit for repo-related tasks
- Phase-aware prerequisite wording applied to downstream organize tools (`relate`, `consolidate`, `move_memory`) — weaker models benefit from being told where each tool sits in the workflow

Stronger models also benefit: clearer top-loaded prerequisites reduce routing variance under ambiguity and long-context pressure.

## Session-start orientation: `project_memory_summary` design

`project_memory_summary` is the canonical session-start entrypoint. It uses a hybrid thematic-first approach with an explicit orientation layer.

**Output structure:**
```typescript
{
  themes: Record<string, ThemeSection>,   // notes grouped by: overview, decisions, tooling, bugs, architecture, quality, other
  recent: RecentNote[],
  anchors: AnchorNote[],
  orientation: {
    primaryEntry: { id, title, rationale },     // best first note to read
    suggestedNext: { id, title, rationale }[],  // 2-3 follow-ups
    warnings?: string[]                          // e.g. >30% notes in "other" bucket
  }
}
```

**Anchor scoring:**
```
score = 0.4 * log(relatedTo.count + 1)
      + 0.4 * connectionDiversity  // distinct themes of related notes
      + 0.2 * recencyBoost(days)
```
Notes tagged `anchor` or `alwaysLoad` are collected first (override), then scored anchors fill remaining slots (max 2 per theme).

**Within-theme ranking:**
```
score = recencyScore + centralityBonus
  recencyScore = 1.0 - min(1.0, daysSinceUpdate / 30)
  centralityBonus = min(0.2, log(relatedTo.count + 1) * 0.1)
```

**Key design choices:**
- No centroid computation — anchors serve as semantic reference points; keeps Phase 0 cheap and deterministic
- Global notes appear only in optional `relatedGlobal` section when `includeRelatedGlobal: true`
- No mandatory embeddings — base functionality works without embedding computation
- Orientation layer provides explicit guidance so agents don’t have to infer starting point from raw data
