---
title: >-
  Workflow hint and phase-aware tool descriptions should be optimized for weaker
  models
tags:
  - mcp
  - prompt
  - workflow
  - design
  - decision
lifecycle: permanent
createdAt: '2026-03-19T21:11:58.752Z'
updatedAt: '2026-03-19T21:11:58.752Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Optimize mnemonic's workflow guidance for weaker models such as GLM-5 and MiniMax without regressing stronger models.

Decision:

- Rewrite `mnemonic-workflow-hint` as a compact decision protocol instead of descriptive prose.
- Put imperative rules first, with strong labels such as `REQUIRES:` or `Before using this tool:`.
- Make the core sequence explicit: `recall -> get -> update` when a memory already exists; use `remember` only when nothing relevant matches.
- Add an uncertainty default: when unsure, prefer `recall` over `remember`.
- Keep `cwd` reminders explicit for repo-related tasks.

Scope decision:

- Do not limit this to the core chain only.
- Apply top-loaded prerequisite or phase-aware wording to downstream organize tools too, especially `relate`, `consolidate`, and `move_memory`, because weaker models benefit from being told where each tool sits in the workflow.

Rationale:

- The current tool descriptions already contain much of the right information, but weaker models underweight negative framing such as "Do not use this when" and often fail to synthesize distributed workflow policy across multiple tools.
- Stronger models also benefit from clearer, top-loaded prerequisites because it reduces routing variance under ambiguity and long-context pressure.

Implementation intent:

- Strengthen prompt and tool wording rather than reintroducing a full system prompt.
- Favor short, repeated vocabulary, explicit sequencing, anti-patterns, and tiny examples.
