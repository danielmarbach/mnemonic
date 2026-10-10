---
title: 'Request root: improve mnemonic-rpi-workflow skill and finalize 1.0.0 release'
tags:
  - workflow
  - request
  - rpir
  - release
  - skill-improvement
  - v1
lifecycle: temporary
createdAt: '2026-10-10T22:38:39.738Z'
updatedAt: '2026-10-10T22:38:39.738Z'
role: context
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
# Request root: improve mnemonic-rpi-workflow skill and finalize 1.0.0 release

**Request (2026-10-11):** Use the autonomous-delivery method (orchestrator plus claude-bridge sonnet 5-5 workers) to improve the `skills/mnemonic-rpi-workflow` skill and finalize mnemonic for version 1.0.

**Authority granted:** autonomous local edits, tests, memory artifacts, local commits on branch `improve/rpi-skill-and-release-1.0.0`. Not granted: git tag, git push, npm publish, merging PRs. These stay with the user.

**Scope:**

- Apply the open items from the reference note on skill improvement opportunities (commit hygiene gate, dirty worktree rules, commit-class state transitions, branch-finish handshake, dogfood anti-brittleness) plus autonomous-mode handling of the user handoffs.
- Keep the `mnemonic-rpi-workflow` MCP prompt and its integration test aligned with the skill.
- Bump 0.47.1 to 1.0.0: package.json, package-lock.json, CHANGELOG entry, README version example, verify:release gate.

**Autonomous-mode checkpoint:** the Research to Plan and Plan to Implement handoffs are recorded here instead of stopping for the user, per the explicit autonomy grant.

**Status:** research done, planning.
