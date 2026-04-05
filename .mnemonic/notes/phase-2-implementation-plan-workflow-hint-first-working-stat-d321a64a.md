---
title: 'Phase 2 implementation plan: workflow-hint-first working-state continuity'
tags:
  - plans
  - workflow
  - temporary-notes
  - phases
lifecycle: temporary
createdAt: '2026-04-05T09:26:57.835Z'
updatedAt: '2026-04-05T10:39:18.178Z'
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
Mostly implemented. The codebase now supports lifecycle-based recovery filters, summary-first workflow guidance, and bounded working-state integration inside `project_memory_summary`. The remaining work is narrower and centered on further refinement and broader integration validation rather than foundational feature work.

Objective:
Implement working-state continuity aligned with the existing mnemonic workflow.

## Implemented so far

1. Workflow hints and tool descriptions document summary-first orientation followed by optional temporary-note recovery.
2. `recall` accepts an optional `lifecycle` filter.
3. `recent_memories` accepts an optional `lifecycle` filter.
4. AGENT, README, and mirrored docs describe temporary-note recovery as a follow-on step after `project_memory_summary`.
5. `project_memory_summary` now includes a bounded `workingState` section when relevant temporary notes exist.
6. Temporary working-state notes are ranked using language-agnostic signals: lifecycle, recency, connectivity, structural shape, and explicit metadata when present.
7. Working-state output now includes a compact recovery hint plus bounded previews and optional extracted next actions.
8. Unit coverage protects the language-independence constraint for working-state ranking, and integration coverage was added for the new summary section.

## Still pending

1. Broader end-to-end integration validation of the new `project_memory_summary` working-state section in an environment that can run the fake embedding server-backed integration tests.
2. Possible refinement of temporary-note prioritization if dogfooding shows that continuation value is still not ranked well enough.
3. Possible refinement of compact synthesis if real blind interruption/resumption runs show the current previews are insufficient.

## Design constraints honored by the implemented subset

- `project_memory_summary` remains the primary orientation entrypoint.
- Temporary notes remain the working-state substrate.
- Recovery is a follow-on step after orientation, not a replacement for orientation.
- No new persistence layer is introduced.
- Working-state ranking remains language-independent at its core; wording cues are not the backbone of prioritization.
- Guidance no longer conflicts with the lifecycle design for temporary-note consolidation.

## Next implementation focus

If Phase 2 continues, the next work should come from dogfooding feedback rather than speculation: validate the new summary integration in a full integration-test environment, run blind interruption/resumption usefulness tests, and then tune ranking or synthesis only if those runs expose concrete weaknesses.
