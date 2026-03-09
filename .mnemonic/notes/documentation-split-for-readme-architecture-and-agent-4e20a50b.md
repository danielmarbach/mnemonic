---
title: 'Documentation split for README, ARCHITECTURE, and AGENT'
tags:
  - documentation
  - architecture
  - agent
  - decision
lifecycle: permanent
createdAt: '2026-03-08T09:22:05.553Z'
updatedAt: '2026-03-08T09:52:21.423Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: agent-instruction-improvements-session-start-recall-first-an-ecd402c3
    type: related-to
memoryVersion: 1
---
Established the documentation split for mnemonic.

- `README.md` is the reader-facing overview and setup entry point.
- `ARCHITECTURE.md` is now the canonical high-level system map, including runtime structure, key concepts, and diagrams.
- `AGENT.md` should focus on agent workflow, maintenance rules, and documentation upkeep rather than duplicating full architectural detail.
- When architecture changes, update `ARCHITECTURE.md` first, then keep `AGENT.md` and `README.md` aligned with links and concise guidance instead of repeating the same content.
