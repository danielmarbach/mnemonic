---
title: Persistence status reporting implementation plan
tags:
  - plan
  - mcp
  - persistence-status
lifecycle: temporary
createdAt: '2026-03-09T10:21:15.547Z'
updatedAt: '2026-03-09T10:21:15.547Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Accepted implementation plan for persistence-status visibility in mutating MCP tools.

Plan:

- Define a shared persistence-status shape that tells callers whether the note file, embedding, git commit, and git push succeeded.
- Include canonical storage paths so callers can locate the note and embedding without an extra lookup.
- Return this status from the write/update flows and any other mutating tools where partial success is possible.
- Add tests covering successful writes and embedding/git partial-success scenarios.
- Update docs so agents know they can trust structured persistence status instead of re-checking every write manually.
