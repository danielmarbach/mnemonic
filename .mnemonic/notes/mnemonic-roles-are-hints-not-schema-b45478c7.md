---
title: 'mnemonic — roles are hints, not schema'
tags:
  - roles
  - prioritization
  - design
  - decision
lifecycle: permanent
createdAt: '2026-03-28T00:56:11.535Z'
updatedAt: '2026-03-28T01:01:19.611Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: enrichment-layer-design-provenance-temporal-recall-projectio-7af26f06
    type: related-to
memoryVersion: 1
---
Roles in mnemonic are optional prioritization hints, not a required schema.

Rationale:

- mnemonic must continue to work fully when notes have no role metadata
- roles should improve orientation and ranking without forcing users into a taxonomy-first workflow
- unknown or invalid role values should be ignored rather than rejected

Tradeoffs:

- weaker guidance than a strict schema, but much lower adoption friction
- some ranking opportunities are missed when users never add metadata, so Phase 7 adds read-only suggestions instead of validation

Constraints:

- explicit frontmatter wins when present
- roles must stay general-purpose across domains
- `role: plan` does not replace lifecycle; plans may be temporary or permanent
- roles must not become a gate for note loading, writing, or recall

Examples:

- a roadmap note may use `role: plan`
- a design rationale may use `role: decision`
- a project overview may use `role: summary`
- a project with no roles must still orient and recall correctly

Future considerations:

- roles may inform additional read-only ranking surfaces later
- custom roles should remain ignored unless there is a clear compatibility story that preserves the hint-only model
