---
title: Temporary implementation plan for protected branch policy
tags:
  - planning
  - feature-49
  - protected-branches
lifecycle: temporary
createdAt: '2026-03-13T07:54:28.865Z'
updatedAt: '2026-03-13T07:54:32.268Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: protected-branch-policy-plan-for-remember-commits-2e2e83d3
    type: explains
memoryVersion: 1
---
Temporary implementation plan for feature #49.

Planned execution steps:

1. Extend policy types and config normalization.
2. Add branch detection + pattern matching helpers.
3. Add remember-time protected-branch guard for project-vault writes.
4. Extend set/get project policy tool schemas, descriptions, and structured output.
5. Add/adjust tests:
   - unit tests for policy normalization and pattern matching
   - integration tests for ask/block/allow flow
6. Run targeted tests and fix regressions.

Validation checklist:

- Protected `main/master/release*` trigger policy flow by default.
- One-time override works without changing persisted policy.
- Setting behavior to block/allow prevents repeated prompts.
- Existing write-scope policy behavior is unchanged.
