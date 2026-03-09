---
title: project memory storage policy
tags:
  - policy
  - scope
  - storage
  - ux
lifecycle: permanent
createdAt: '2026-03-07T19:25:37.785Z'
updatedAt: '2026-03-07T19:41:05.715Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mnemonic-key-design-decisions-3f2a6273
    type: related-to
memoryVersion: 1
---
Decision: project context and storage location are separate, and each project can keep a default write policy so agents only need to ask when necessary.

- `cwd` identifies project context.
- `scope: "project"` stores shared knowledge in `/.mnemonic/`.
- `scope: "global"` stores a private note in the main vault while keeping project association for recall and relationships.
- `remember` uses explicit `scope` first, then the saved project policy, then the fallback behavior.
- `set_project_memory_policy` supports `project`, `global`, and `ask`.
- When the policy is `ask`, agents should present a clear storage selection instead of guessing.
- `update` no longer rewrites project metadata just because `cwd` was passed for lookup.
