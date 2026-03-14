---
title: >-
  remember tool: checkedForExisting is schema-only agent hint with no behavior
  change
tags:
  - mcp
  - remember-tool
  - schema-design
  - decision
lifecycle: permanent
createdAt: '2026-03-14T14:45:28.775Z'
updatedAt: '2026-03-14T15:01:27.637Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mnemonic-key-design-decisions-3f2a6273
    type: related-to
memoryVersion: 1
---
The `checkedForExisting` boolean field added to `remember`'s input schema is intentionally schema-only — it carries no runtime behavior.

## Decision

Agents can pass `checkedForExisting: true` to signal they already ran `recall` or `list` before calling `remember`. This is useful as a workflow audit trail and may inform future logging or metrics, but must not gate writes — blocking writes on a missing hint would break non-annotating callers and add fragility.

## What changed in remember (2026-03-14 follow-up pass)

- `checkedForExisting`: new optional boolean, schema-only, not destructured in handler
- `cwd` description: updated to "whenever the task is **related to a repository**" (more precise than "project-related")
- `lifecycle` description: rewritten to match exact canonical phrasing (`temporary` = active investigations/transient status, `permanent` = decisions/fixes/patterns/preferences)
- "Do not use when" bullet: changed to "A memory may already exist; use `recall` first to check" (more direct)

## Pattern for future schema-only hints

Add as optional boolean/string with clear description. Do not destructure in handler unless logging is explicitly desired. Document as schema-only in this note.
