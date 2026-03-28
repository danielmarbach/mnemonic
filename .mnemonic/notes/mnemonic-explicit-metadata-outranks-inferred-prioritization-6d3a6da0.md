---
title: mnemonic — explicit metadata outranks inferred prioritization
tags:
  - roles
  - prioritization
  - metadata
  - design
lifecycle: permanent
createdAt: '2026-03-28T00:56:11.593Z'
updatedAt: '2026-03-28T00:57:36.631Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mcp-workflow-ux-hint-prompt-tool-descriptions-and-session-st-e89a18fc
    type: explains
memoryVersion: 1
---
Effective metadata in Phase 7 follows an explicit precedence order: explicit frontmatter first, suggested role or importance second, and none otherwise.

Rationale:

- user-authored metadata is a stronger signal than heuristic inference
- preserving explicit intent avoids ranking surprises and keeps the system predictable
- the precedence model lets mnemonic improve metadata-free notes without challenging user-provided labels

Precedence:

1. explicit frontmatter
2. suggested role or importance
3. none

Important constraints:

- `alwaysLoad` is never inferred; only explicit values count
- project-summary anchor and within-theme scoring only apply metadata bonuses for explicit metadata so metadata-free notes retain baseline orientation behavior
- recall and relationship ranking may use suggested metadata additively, but semantics and same-project priority remain primary

Examples:

- an explicit `role: context` note must not be silently treated as `summary`
- a note with no metadata may get a small recall boost from a strong suggested summary role
- an explicit `importance: low` note keeps that explicit value even if heuristics would otherwise rate it higher

Future considerations:

- later phases can expose debug provenance for why a role was treated as explicit or suggested
- any future ranking changes should preserve this precedence contract to avoid regressions in trust
