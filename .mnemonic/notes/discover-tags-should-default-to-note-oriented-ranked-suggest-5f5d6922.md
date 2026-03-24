---
title: >-
  discover_tags should default to note-oriented ranked suggestions instead of
  full tag inventories
tags:
  - discover_tags
  - design
  - decision
  - mcp
  - documentation
lifecycle: permanent
createdAt: '2026-03-23T20:41:59.873Z'
updatedAt: '2026-03-24T10:55:45.308Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: tag-discovery-design-note-oriented-pivot-and-cognitive-model-31e928dc
    type: supersedes
memoryVersion: 1
---
Shift `discover_tags` from corpus-oriented tag inventory output to note-oriented tag suggestion output.

Decision:

- Keep the tool name `discover_tags`.
- Make the default behavior compact and note-specific: the caller provides note context such as `title`, `content`, `query`, or candidate tags, and the tool returns ranked canonical tag suggestions for that note.
- Rank by note relevance first and usage count second so low-value but common tags do not dominate, while still preferring canonical project vocabulary.
- Demote tags that only appear on temporary notes unless the target note also appears temporary.
- Avoid returning the full corpus-wide tag list in default structured output; broad browsing should be explicit rather than automatic.

Rationale:

- The current full-tag structured output can become very large and waste context.
- Returning the whole tag inventory still exposes many unrelated tags to the agent.
- The original design goal was to prevent agents from inventing or overusing unrelated tags; note-oriented ranking serves that goal better than popularity-only truncation.

Documentation impact when implemented:

- Tighten tool descriptions and workflow guidance so `discover_tags` is described as suggesting canonical tags for a specific note.
- Update `README.md`, `AGENT.md`, tool lists, and homepage copy to stop implying that the normal workflow is to enumerate the whole tag corpus.

Non-goal:

- Do not regress to purely popularity-based top-N tags. The result should stay relevance-aware so uncommon but appropriate tags can still surface.
