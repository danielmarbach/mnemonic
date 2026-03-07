---
title: markdown linting for memory content
tags:
  - markdown
  - linting
  - decisions
  - dogfooding
createdAt: '2026-03-07T18:37:11.013Z'
updatedAt: '2026-03-07T18:37:11.013Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
---
Decision: lint markdown note bodies during `remember` and `update` so recalled content stays clean and consistent.

Implementation details:

- Run `markdownlint` before persisting note content.
- Auto-apply fixable issues like malformed headings, list spacing, and extra blank lines.
- Reject non-fixable issues after auto-fix so low-quality markdown does not get stored.
- Disable `MD013` (line length) and `MD041` (first line must be an H1) because note bodies are content fragments, not standalone documents.

Dogfooding note: the repo MCP server was rebuilt locally and this note was created through the local `mnemonic` MCP server, not by writing the vault files directly.
