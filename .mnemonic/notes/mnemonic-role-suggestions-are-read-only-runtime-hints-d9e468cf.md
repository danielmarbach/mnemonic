---
title: mnemonic — role suggestions are read-only runtime hints
tags:
  - roles
  - inference
  - design
  - decision
lifecycle: permanent
createdAt: '2026-03-28T00:56:11.547Z'
updatedAt: '2026-03-28T00:57:36.627Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: enrichment-layer-design-provenance-temporal-recall-projectio-7af26f06
    type: explains
memoryVersion: 1
---
Role and importance suggestions in mnemonic are read-only runtime hints and must never mutate notes.

Rationale:

- inferred metadata is there to improve prioritization when explicit frontmatter is absent
- auto-writing inference back into note frontmatter would blur the line between user intent and system guesswork
- keeping suggestions runtime-only avoids surprise churn in note files and prevents heuristics from silently rewriting the knowledge base

Tradeoffs:

- the same suggestion may be recomputed repeatedly instead of being cached into notes
- users do not get a permanent inferred label unless they explicitly add frontmatter themselves

Constraints:

- explicit metadata always outranks suggestions
- `alwaysLoad` is explicit-only and is never inferred
- effective metadata must be computed on demand and never persisted into notes, projections, or stored caches
- suggested metadata should be sparse and high-precision rather than ubiquitous

Examples:

- a hub note may be treated like a summary during ranking without gaining `role: summary` in frontmatter
- a strongly structured checklist may influence plan-oriented ranking without changing the markdown file

Future considerations:

- debug output may eventually expose suggested metadata for inspection
- if users want persistence, that should happen through explicit editing rather than heuristic write-back
