---
title: Persistence status reporting design and implementation
tags:
  - design
  - implementation
  - mcp
  - persistence-status
lifecycle: permanent
createdAt: '2026-03-09T11:32:57.609Z'
updatedAt: '2026-03-09T12:00:28.311Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
---
Implementation outcome for persistence-status visibility in mutating MCP tools.

What changed:

- `remember`, `update`, `move_memory`, and consolidation writes now return structured persistence details.
- Persistence includes canonical note and embedding paths, embedding write outcome, git commit/push outcome, derived durability, and the attempted commit message/body.
- This lets MCP clients trust the write result directly instead of doing an immediate `get` or `list` just to verify that a note was created or updated.
- Sync behavior already heals missing local embeddings, and persistence reporting now makes local-only vs committed vs pushed outcomes explicit.

Design decisions:

- Use structured persistence metadata instead of extra verification reads.
- Include commit message/body because failed or skipped git steps may still leave the client needing a ready-to-use commit payload.
- Keep embedding failures best-effort and visible rather than turning them into hard note-write failures.
- Document that agents should inspect persistence status before issuing follow-up verification calls.
