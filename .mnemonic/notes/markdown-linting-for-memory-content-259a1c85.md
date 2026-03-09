---
title: markdown linting for memory content
tags:
  - markdown
  - linting
  - decisions
  - dogfooding
lifecycle: permanent
createdAt: '2026-03-07T18:37:11.013Z'
updatedAt: '2026-03-07T18:42:51.656Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mnemonic-key-design-decisions-3f2a6273
    type: related-to
memoryVersion: 1
---
Decision: lint markdown note bodies during `remember` and `update` so recalled content stays clean and consistent.

Implementation details:

- Run `markdownlint` before persisting note content.
- Auto-apply fixable issues like malformed headings, list spacing, and extra blank lines.
- Reject non-fixable issues after auto-fix so low-quality markdown does not get stored.
- Disable `MD013` (line length) and `MD041` (first line must be an H1) because note bodies are content fragments, not standalone documents.
- `get`, `relate`, `unrelate`, and `forget` now accept `cwd` so a fresh project-scoped server can resolve project-vault notes reliably.

Dogfooding note: the repo MCP server was rebuilt locally and this note was created and related through the local `mnemonic` MCP server, not by writing the vault files directly.
