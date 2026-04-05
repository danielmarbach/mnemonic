---
title: 'Phase 2 design: workflow-hint-first working-state continuity'
tags:
  - design
  - workflow
  - temporary-notes
  - phases
lifecycle: permanent
createdAt: '2026-04-05T09:26:46.284Z'
updatedAt: '2026-04-05T09:27:08.361Z'
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: phase-2-implementation-plan-workflow-hint-first-working-stat-d321a64a
    type: explains
memoryVersion: 1
---
Decision: Phase 2 should improve working-state continuity inside the existing mnemonic workflow rather than introducing a new ritual or a parallel memory system.

Core design:

- `project_memory_summary` remains the primary orientation entrypoint.
- Temporary notes remain the working-state substrate.
- Structured working-state temporary notes improve continuity for in-progress work.
- Recovery happens after project orientation and must not replace orientation.

Guiding principle:
Preserve work as temporary notes when continuation value is high, recover that state after project orientation, and consolidate stable outcomes back into durable memory.

Alignment with existing project design recalled from memory:

- This extends the established workflow UX decision that session-start orientation should stay centered on `project_memory_summary`.
- This is consistent with the lifecycle decision that temporary notes are the right substrate for active planning and WIP, while durable outcomes belong in permanent notes.
- The design goal explicitly avoids a new persistence layer or separate working-state system.
