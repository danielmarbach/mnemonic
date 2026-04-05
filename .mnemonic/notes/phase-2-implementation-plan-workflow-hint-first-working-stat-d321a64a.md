---
title: 'Phase 2 implementation plan: workflow-hint-first working-state continuity'
tags:
  - plans
  - workflow
  - temporary-notes
  - phases
lifecycle: temporary
createdAt: '2026-04-05T09:26:57.835Z'
updatedAt: '2026-04-05T10:18:19.779Z'
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: phase-2-design-workflow-hint-first-working-state-continuity-07153fcb
    type: explains
  - id: mcp-workflow-ux-hint-prompt-tool-descriptions-and-session-st-e89a18fc
    type: related-to
  - id: temporary-note-lifecycle-and-consolidation-defaults-988f6e20
    type: related-to
memoryVersion: 1
---
Implementation plan for Phase 2 working-state continuity.

Status:
Partially implemented. The current codebase adds lifecycle-based recovery filters and aligns the workflow guidance, but it does not yet complete every originally listed milestone.

Objective:
Implement working-state continuity aligned with the existing mnemonic workflow.

## Implemented so far

1. Workflow hints and tool descriptions now document summary-first orientation followed by optional temporary-note recovery.
2. `recall` accepts an optional `lifecycle` filter.
3. `recent_memories` accepts an optional `lifecycle` filter.
4. AGENT, README, and mirrored docs now describe temporary-note recovery as a follow-on step after `project_memory_summary`.
5. Review coverage now checks that the workflow hint keeps orientation first and does not force `consolidate` with `strategy: "supersedes"` for temporary checkpoints.

## Still pending

1. A dedicated ranking or prioritization layer for temporary working-state notes beyond the explicit lifecycle filter.
2. Compact synthesis of recovered working state.
3. Direct integration of working-state recovery into `project_memory_summary` output rather than requiring a follow-on tool call.
4. End-to-end tests that cover the broader remaining milestones beyond lifecycle filtering and prompt guidance.

## Design constraints honored by the implemented subset

- `project_memory_summary` remains the primary orientation entrypoint.
- Temporary notes remain the working-state substrate.
- Recovery is a follow-on step after orientation, not a replacement for orientation.
- No new persistence layer is introduced.
- Guidance no longer conflicts with the lifecycle design for temporary-note consolidation.

## Next implementation focus

If Phase 2 continues, the next work should add bounded ranking and compact synthesis for temporary notes without turning recovery into a parallel entrypoint or introducing a separate persistence model.
