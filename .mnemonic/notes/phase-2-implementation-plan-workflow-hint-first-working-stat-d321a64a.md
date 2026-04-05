---
title: 'Phase 2 implementation plan: workflow-hint-first working-state continuity'
tags:
  - plans
  - workflow
  - temporary-notes
  - phases
lifecycle: temporary
createdAt: '2026-04-05T09:26:57.835Z'
updatedAt: '2026-04-05T09:53:56.590Z'
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

Objective:
Implement working-state continuity aligned with the existing mnemonic workflow.

Milestones:

1. ✅ Align workflow hints and tool descriptions.
2. ✅ Define a structured temporary working-state note pattern.
3. ✅ Implement working-state preservation mechanism for temporary notes.
4. ✅ Add recovery mechanism after project orientation to restore working state.
   - Added `lifecycle` filter parameter to `recall` tool
   - Added `lifecycle` filter parameter to `recent_memories` tool
   - Recovery follows orientation (not replacing it)
5. Implement ranking/prioritization for temporary working-state notes.
6. Implement compact synthesis for working-state recovery.
7. Ensure project summary integration.
8. Add consolidation alignment for temporary working-state notes.
9. Write comprehensive tests for working-state continuity features.
10. Perform dogfooding run against compiled changes.
11. Update AGENT.md and documentation with Phase 2 workflow changes.

Definition of done:

- Project orientation still starts with `project_memory_summary`.
- Temporary notes are the continuity mechanism.
- Recovery is compact and useful.
- No new persistence layer is introduced.

Guiding principle:
Orient with project memory, continue with temporary working state, and consolidate stable value back into durable notes.

## Implementation Details

### Workflow Hints (Milestone 1)

Updated `mnemonic-workflow-hint` prompt with Phase 2 continuity guidance:

- Added "Working-state continuity (Phase 2)" section
- Explains when to use lifecycle: temporary vs permanent
- Clarifies recovery happens after orientation
- Added anti-pattern examples for correct workflow

### Temporary Note Pattern (Milestone 2)

Design established:

- Use `lifecycle: temporary` metadata field (already exists from Phase 1)
- Temporary notes for plans, WIP, investigations
- Permanent notes for decisions, constraints, lessons
- Tags remain descriptive only (plan, wip don't control behavior)

### Preservation Mechanism (Milestone 3)

Leverages existing temporary note infrastructure:

- `lifecycle: temporary` field controls durability
- `remember`/`update` tools already support lifecycle
- `consolidate` can delete or supersede temporary notes

### Recovery Mechanism (Milestone 4)

Completed:

- Added optional `lifecycle` filter to `recall` tool (temporary|permanent)
- Added optional `lifecycle` filter to `recent_memories` tool
- Recovery workflow: `project_memory_summary` → orientation → `recall(lifecycle: temporary)` → continue work
- Filters are opt-in (backward compatible)
- Implementation constraint satisfied: recovery is follow-on step, not replacement

## Remaining Work

Milestones 5-8 involve minor enhancements to existing features:

1. Ranking for temporary notes: Already supported via metadata boost system
2. Compact synthesis: Already part of existing recall output format
3. Project summary integration: Already shows themes, recent, anchors (temporary notes appear naturally)
4. Consolidation alignment: Already supported via `consolidate` tool with lifecycle-aware defaults

The core Phase 2 goal (workflow-hint-first continuity) is implemented. Remaining items are tuning and testing rather than new features.
