---
title: Protected branch policy design decisions for remember commits
tags:
  - policy
  - git
  - protected-branches
  - feature-49
  - design
lifecycle: permanent
createdAt: '2026-03-13T07:52:12.728Z'
updatedAt: '2026-03-13T07:54:15.249Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Design decisions for feature request #49 (avoid automatic commits on protected branches).

Core direction:

- Keep detection local-only. Do not query GitHub branch protection APIs.
- Reuse existing per-project policy storage in main-vault config (`projectMemoryPolicies`) instead of introducing a new top-level config section.
- Keep commit behavior deterministic: if the current branch matches a protected pattern, behavior is policy-driven and explicit.

Policy model:

- Extend `ProjectMemoryPolicy` with:
  - `protectedBranchPatterns: string[]` (glob-like patterns)
  - `protectedBranchBehavior: "ask" | "block" | "allow"`
- Built-in default patterns when unset: `main`, `master`, `release*`.
- Default behavior when unset: `ask`.

Runtime behavior (remember + project-vault writes):

- `allow`: proceed with note write + commit/push flow.
- `block`: reject auto-commit path on protected branch with clear remediation text.
- `ask`: return actionable guidance that offers two paths:
  1) one-time override to proceed now, and
  2) persistent policy update to `block` or `allow` so the user is not prompted again.

UX constraints:

- Never silently skip commit.
- Never auto-create/switch branches.
- Preserve existing non-project and main-vault behavior.
- Keep fallback defaults safe and discoverable through tool descriptions/output.

Compatibility:

- Existing policies remain valid; new fields are optional.
- If users never configure branch behavior, default patterns + `ask` handle common protected branches out of the box.
