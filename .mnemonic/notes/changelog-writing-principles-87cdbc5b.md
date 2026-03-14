---
title: Changelog writing principles
tags:
  - changelog
  - documentation
  - conventions
lifecycle: permanent
createdAt: '2026-03-14T13:06:56.354Z'
updatedAt: '2026-03-14T13:06:56.354Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Keep changelog entries concise — 1-2 sentences max per bullet. Implementation details (retry logic, concurrency protection, internal parameters) belong in commit messages, not changelog. Follow the verbosity level of existing entries: 0.7.0 uses brief 1-sentence bullets, 0.8.0 initially had verbose multi-sentence entries that were trimmed. When trimming verbose entries, preserve API changes as they're useful reference.
