---
title: Project identity remote override for forked repos
tags:
  - project-identity
  - forks
  - git
  - design
lifecycle: permanent
createdAt: '2026-03-08T12:36:52.818Z'
updatedAt: '2026-03-08T12:36:56.668Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mnemonic-key-design-decisions-3f2a6273
    type: related-to
memoryVersion: 1
---
Added fork-aware project identity overrides.

- Default project identity still comes from the `origin` remote so existing behavior remains unchanged.
- New MCP tools `set_project_identity` and `get_project_identity` let a forked repo use another remote such as `upstream` as its canonical project identity.
- The first iteration deliberately supports only remote-name overrides, not arbitrary `projectId` injection, to keep identity grounded in git metadata and avoid a premature escape hatch.
- Overrides are stored in main-vault `config.json`, applied during project detection, exposed in `detect_project`, and covered by unit plus MCP integration tests.
