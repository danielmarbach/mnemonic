---
title: project memory introspection tooling
tags:
  - tools
  - introspection
  - mcp
  - ux
createdAt: '2026-03-07T19:36:56.068Z'
updatedAt: '2026-03-07T19:36:57.701Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mnemonic-mcp-tools-inventory-47499799
    type: related-to
---
Added dedicated project introspection tools so an LLM can ask what mnemonic knows about a project without stitching together many calls.

- `project_memory_summary` gives a compact project overview, current write policy, storage counts, grouped themes, and recent changes.
- `recent_memories` returns the latest updated notes for a scope.
- `memory_graph` returns a compact adjacency list of visible relationships.
- `list` can now include previews, relations, storage location, and update timestamps.
- `detect_project` surfaces the current write policy so agents can adapt immediately.
