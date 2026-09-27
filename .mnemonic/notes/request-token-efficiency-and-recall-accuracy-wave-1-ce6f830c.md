---
title: 'Request: token efficiency and recall accuracy wave 1'
tags:
  - workflow
  - request
  - token-efficiency
  - recall
lifecycle: temporary
createdAt: '2026-09-27T12:05:34.987Z'
updatedAt: '2026-09-27T12:05:34.987Z'
role: context
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Make mnemonic more token-efficient and more accurate in results, including for weaker models, without breaking the file-first design constraints.

Branch: `improve/token-efficiency-and-recall-accuracy`. Research: `research-token-efficiency-and-recall-accuracy-improvements-m-fe9233c8`.

Execution: parallel lanes in dedicated git worktrees under `../mnemonic-lanes/<lane>` on branches `lane/<lane>`. Writers use claude-bridge/claude-sonnet-5, fresh-context reviewers use claude-bridge/claude-opus-5-5. The parent integrates the lanes into the dedicated branch. Each lane owns its CHANGELOG and, where needed, README/AGENT.md/docs/index.html updates.
