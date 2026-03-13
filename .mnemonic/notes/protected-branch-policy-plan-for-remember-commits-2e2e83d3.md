---
title: Protected branch policy decisions and implementation for remember commits
tags:
  - policy
  - git
  - protected-branches
  - feature-49
  - design
  - implementation
lifecycle: permanent
createdAt: '2026-03-13T07:52:12.728Z'
updatedAt: '2026-03-13T08:18:19.580Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: temporary-implementation-plan-for-protected-branch-policy-98487b33
    type: explains
memoryVersion: 1
---
Feature #49 is implemented: automatic project-vault commits in `remember` now respect protected-branch policy, using local branch matching only.

Final decisions and behavior:

- Detection is local-only (no GitHub branch protection API calls).
- Policy is stored in existing per-project config under `projectMemoryPolicies`.
- `ProjectMemoryPolicy` includes:
  - `protectedBranchPatterns: string[]`
  - `protectedBranchBehavior: "ask" | "block" | "allow"`
- Built-in protected branch patterns: `main`, `master`, `release*`.

Runtime semantics:

- Protected-branch checks apply to automatic project-vault commits (scope omitted).
- `protectedBranchBehavior: "ask"` returns actionable guidance with:
  1) one-time override via `allowProtectedBranch: true`, and
  2) persistent policy options (`block` or `allow`).
- `block` refuses automatic commit with remediation text.
- `allow` proceeds normally.
- Explicit `scope` continues to work and does not trigger protected-branch prompting.

Compatibility tradeoff:

- No-policy projects default to `ask` for safer first-time behavior on common protected branches.
- Existing project policies without `protectedBranchBehavior` default to `allow` to avoid breaking established workflows.

Implementation completed across:

- policy + matching helpers, config normalization, current-branch detection
- remember guard + one-time override input
- set/get project policy schemas/descriptions/structured output
- README + AGENT documentation updates
- unit + integration coverage (including ask/block/allow and override)

Validation:

- Targeted tests passed: `tests/project-memory-policy.test.ts`, `tests/config.test.ts`, `tests/mcp.integration.test.ts` (53/53).
