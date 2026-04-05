---
title: 'Phase 2 implementation plan: workflow-hint-first working-state continuity'
tags:
  - plans
  - workflow
  - temporary-notes
  - phases
lifecycle: temporary
createdAt: '2026-04-05T09:26:57.835Z'
updatedAt: '2026-04-05T09:38:54.824Z'
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
2. Define a structured temporary working-state note pattern.
3. Implement working-state preservation.
4. Add recovery after project orientation.
5. Add ranking for temporary working-state notes.
6. Implement compact synthesis.
7. Ensure project summary integration.
8. Add consolidation alignment.
9. Add tests and tuning.

Definition of done:

- Project orientation still starts with `project_memory_summary`.
- Temporary notes are the continuity mechanism.
- Recovery is compact and useful.
- No new persistence layer is introduced.

Guiding principle:
Orient with project memory, continue with temporary working state, and consolidate stable value back into durable notes.

## Design Context

This implementation follows the Phase 2 design decision that working-state continuity should be achieved within the existing workflow:

- `project_memory_summary` remains the canonical session-start entrypoint (not replaced by working-state recovery)
- Temporary notes serve as the working-state substrate (no parallel persistence layer)
- Recovery is a follow-on step after orientation (not a competing entrypoint)
- Preservation is selective based on continuation value

See related design notes:

- `phase-2-design-workflow-hint-first-working-state-continuity` for core principles
- `mcp-workflow-ux-hint-prompt-tool-descriptions-and-session-st` for UX patterns
- `temporary-note-lifecycle-and-consolidation-defaults` for temporary vs permanent decisions

## Implementation Constraints

1. **Selective Preservation**: Only preserve working-state when continuation value is high. Working-state should be ephemeral by default; capture happens deliberately.

2. **Orientation-Then-Recovery**: Recovery must not replace orientation. Agents call `project_memory_summary` first, then recover working-state as a separate step.

3. **Consolidation Integration**: Working-state should naturally consolidate into durable notes. Temporary notes get superseded or deleted once their knowledge stabilizes.
