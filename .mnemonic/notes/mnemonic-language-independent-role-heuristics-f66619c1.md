---
title: mnemonic — language-independent role heuristics
tags:
  - roles
  - heuristics
  - language-independence
  - design
lifecycle: permanent
createdAt: '2026-03-28T00:56:11.578Z'
updatedAt: '2026-04-16T19:47:01.107Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mcp-workflow-ux-hint-prompt-tool-descriptions-and-session-st-e89a18fc
    type: related-to
memoryVersion: 1
---
Phase 7 role suggestions prioritize language-independent structural and graph signals over wording cues.

Rationale:

- mnemonic is a general-purpose MCP and must work for mixed-language and non-English notes
- overfitting to English note titles or mnemonic-specific vocabulary would make the feature brittle and misleading
- graph shape, heading breadth, list structure, and relationship patterns generalize better than keyword spotting

Primary signals:

- relationship centrality and inbound/outbound shape
- connection diversity across visible project notes
- heading count and breadth
- ordered-list, task-list, and lookup-style structure
- baseline anchor candidacy only as a weak secondary signal

Secondary signals:

- wording cues may be used only as weak optional boosts
- wording alone must not push an ambiguous note over the threshold

Tradeoffs:

- lower recall for some thin notes with little structure
- higher precision and better cross-language behavior

Constraints:

- language-neutral structure and graph evidence remains primary
- unsupported-language notes should behave the same as cue-word variants when structure is identical
- tuning decisions must not optimize only for mnemonic's own notes

Future considerations:

- additional structural signals may improve precision later
- multilingual wording support can be added only as supplementary evidence, never as the backbone of inference
