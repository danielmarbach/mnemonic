---
title: CI timeout lesson for MCP integration smoke test
tags:
  - ci
  - testing
  - timeout
  - mcp
  - lesson
createdAt: '2026-03-08T09:00:51.235Z'
updatedAt: '2026-03-08T09:00:51.235Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Refined the first CI failure-learning rollout after reviewing a real failing artifact.

- The MCP integration smoke test was valid but too close to Vitest's default 5s timeout on GitHub Actions, so it now uses an explicit 15s timeout.
- The CI failure summarizer now gives a timeout-specific lesson instead of a generic portability/isolation hint.
- This keeps the artifact more actionable: timeout failures should suggest increasing explicit timeouts or reducing process startup overhead on shared runners.
- The broader artifact-first/manual-promotion design still looks sound; the first real artifact mainly exposed a test-runtime threshold issue.
