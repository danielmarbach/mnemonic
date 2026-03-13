---
title: Release 0.7.0 protected-branch rollout execution results
tags:
  - release
  - protected-branches
  - implementation
  - testing
  - 0.7.0
lifecycle: temporary
createdAt: '2026-03-13T09:44:35.545Z'
updatedAt: '2026-03-13T09:44:35.545Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Implemented the 0.7.0 rollout plan for protected-branch policy consistency.

Completed work:

- Extended protected-branch enforcement beyond `remember` to `update`, `forget`, `move_memory`, and mutating `consolidate` paths.
- Added one-time override input support (`allowProtectedBranch`) for those tools.
- Updated branch-protection guidance text to reference the active tool name.
- Updated user and maintainer docs (`README.md`, `AGENT.md`, `docs/index.html`) to reflect cross-tool behavior.
- Added changelog entry for 0.7.0 and bumped package version to 0.7.0.
- Expanded MCP integration coverage to verify protected-branch policy behavior for the newly covered tools.
- Verified with build and targeted test suites.

Validation run:

- `npm run build`
- `npm run test -- tests/project-memory-policy.test.ts tests/config.test.ts tests/mcp.integration.test.ts`

Result: tests passed and build succeeded.
