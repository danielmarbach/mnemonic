---
title: 'import-claude-memory CLI command: design and implementation'
tags:
  - cli
  - import
  - claude-memory
  - design-decision
lifecycle: permanent
createdAt: '2026-03-09T21:24:01.304Z'
updatedAt: '2026-03-09T21:24:01.304Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Added `mnemonic import-claude-memory` CLI command to import Claude Code auto-memory into the mnemonic vault.

## What it does

Reads Claude Code auto-memory files from `~/.claude/projects/<encoded-path>/memory/*.md`, splits each file on `##` headings into sections, and writes each section as a separate mnemonic note to the main vault with `lifecycle: permanent`, `scope: global`, and tags `["claude-memory", "imported", "<filename-slug>"]`. Duplicate titles are skipped (case-insensitive match).

## Path encoding

Claude Code encodes the project path as directory name by replacing every `/` with `-`. For example:
`/Users/foo/Projects/bar` → `-Users-foo-Projects-bar`
The memory directory is then: `~/.claude/projects/<encoded>/memory/`

## Design decisions

- **One note per `##` section** (not one per file) — maximizes `recall` surface area; each section can surface independently in semantic search
- **Global scope, main vault** — Claude auto-memory is personal context, not project-shareable knowledge; user can `move_memory` to project vault later if needed
- **Title-based deduplication** — safe to re-run; existing notes are never overwritten to avoid clobbering user edits
- **No embedding on import** — notes are written raw; user runs `sync` afterwards to embed and push (consistent with how `remember` works when Ollama is unavailable)
- **`CLAUDE_HOME` env override** — allows non-default Claude home paths without code changes

## Rejected alternatives

- One note per file: less useful for recall, especially if MEMORY.md has 5+ unrelated sections
- Auto-update existing notes on re-run: too aggressive — user may have edited or enriched imported notes
- Project scope: auto-memory is personal; it may reference multiple projects and shouldn't automatically land in any one project vault

## Entry point

`src/index.ts` — same pattern as `migrate` CLI block. `process.argv[2] === "import-claude-memory"` check at top, early-exits with `process.exit(0/1)`. Blocking `await new Promise(() => {})` prevents MCP server from starting.

## Documentation

Documented in README.md under `## CLI utilities` and in `docs/index.html` Setup section as a two-column CLI utilities block.
