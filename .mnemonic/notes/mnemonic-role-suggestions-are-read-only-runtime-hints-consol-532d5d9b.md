---
title: mnemonic — role suggestions are read-only runtime hints (consolidated)
tags:
  - roles
  - inference
  - design
  - decision
lifecycle: permanent
createdAt: '2026-04-04T22:09:20.109Z'
updatedAt: '2026-04-04T22:09:20.109Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: enrichment-layer-design-provenance-temporal-recall-projectio-7af26f06
    type: explains
  - id: enrichment-layer-design-provenance-temporal-recall-projectio-7af26f06
    type: related-to
memoryVersion: 1
---
Consolidated two notes covering the same topic: roles are read-only hints, not a schema or persisted mutation.

Roles and importance suggestions in mnemonic are **read-only runtime hints**, not a required schema, and must never mutate notes.

## Core principle

- Inferred metadata improves prioritization when explicit frontmatter is absent
- Auto-writing inference back into note frontmatter blurs the line between user intent and system guesswork
- Keeping suggestions runtime-only avoids surprise churn in note files and prevents heuristics from silently rewriting the knowledge base

## Design constraints

- **Explicit frontmatter wins** when present — `alwaysLoad` is explicit-only and is never inferred
- Roles must stay **general-purpose across domains** (`plan`, `decision`, `summary`, etc.)
- Unknown or invalid role values are **ignored rather than rejected**
- Roles must **never gate** note loading, writing, or recall
- Effective metadata must be computed on demand and **never persisted** into notes, projections, or stored caches
- Suggested metadata should be **sparse and high-precision** rather than ubiquitous

## Tradeoffs

- The same suggestion may be recomputed repeatedly instead of being cached into notes
- Users do not get a permanent inferred label unless they explicitly add frontmatter themselves
- Weaker guidance than a strict schema, but much lower adoption friction

## Examples

- A hub note may be treated like a summary during ranking without gaining `role: summary` in frontmatter
- A strongly structured checklist may influence plan-oriented ranking without changing the markdown file
- A roadmap note may use `role: plan`; a design rationale may use `role: decision`
- A project with no roles must still orient and recall correctly

## Future considerations

- Debug output may eventually expose suggested metadata for inspection
- If users want persistence, that should happen through explicit editing rather than heuristic write-back
- Custom roles should remain ignored unless there is a clear compatibility story that preserves the hint-only model
