---
title: Persistence status reporting implementation outcome
tags:
  - implementation
  - mcp
  - persistence-status
lifecycle: temporary
createdAt: '2026-03-09T11:27:53.811Z'
updatedAt: '2026-03-09T11:27:53.811Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
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
