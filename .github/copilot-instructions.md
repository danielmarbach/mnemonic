# GitHub Copilot Instructions for mnemonic

## Project overview

mnemonic is a local MCP memory server that stores LLM memories as plain markdown in a git repo
with local embeddings via Ollama. Design decisions, architecture notes, and learnings are captured
as structured notes in `.mnemonic/notes/`.

## PR title and description generation

Describe the PR from the diff and commit messages; use mnemonic notes changed in the PR for the
"why". The `/update-pr` comment command (`.github/workflows/update-pr-description.md`) follows the
same rules.

### How to find relevant context

1. Read the diff and commit messages first — they are the source of truth for what changed.
2. Check the PR for files under `.mnemonic/notes/` — structured notes written by the author during
   the session that produced the PR. Read the YAML frontmatter (`title`, `tags`, `role`,
   `lifecycle`) and the markdown body of each note.
3. Permanent notes (no `role`) carry decisions and rationale. Notes with a `role`
   (`research`, `plan`, `review`, `context`) or `lifecycle: temporary` are process artifacts:
   mine them for facts, but never use their titles (`Plan: …`, `Apply: …`) as the PR title.

### PR title format

- Imperative mood, present tense (e.g. "Add", "Fix", "Implement", "Refactor", "Extract")
- Specific: what changed and why it matters
- Name the change, not the process that produced it
- Under 72 characters

**Examples from this repo:**
- `Add lifecycle field to distinguish temporary from permanent notes`
- `Implement bidirectional sync with embedding backfill`
- `Fix consolidate scope bug that excluded cross-scope notes`

### PR description format

Use these sections, omitting any that would only be padding:

```markdown
## Summary

[2–4 sentences: what changes for users or maintainers, and why]

## Changes

[Bullets grouped by behavior or component, naming key functions, config keys, env vars, tools]

## Design decisions

[Choices and their reasons: alternatives, constraints, tradeoffs — mostly from permanent notes]

## Compatibility and risk

[Breaking changes, migrations, changed defaults, re-index/re-embed requirements]

## Testing

[What the tests cover and any verification recorded in the notes]

## Related

[`Fixes #N` lines, then a collapsed <details> list of the mnemonic notes]
```

### What to emphasise

- **Decision rationale**: why this approach was chosen over alternatives
- **Constraints and tradeoffs**: what was deliberately left out or deferred
- **Affected areas**: which parts of the system are touched and how they interact
- **Tags as signals**: note tags describe the domain (`ci`, `testing`, `migration`, `vault`,
  `mcp`, `docs`, etc.) — use them to frame the PR summary accurately

### What to avoid

- Generic summaries that could apply to any PR ("various improvements were made")
- Listing every file changed without explaining purpose
- Repeating frontmatter fields verbatim — synthesise, don't copy-paste
- Omitting the design rationale that the notes were written to capture

## Code style and conventions

- TypeScript with explicit types at function boundaries; infer elsewhere
- Exhaustive switch statements using `never` for union types
- String literal unions over enums
- `unknown` for dynamic/external data, not `any`
- All MCP tools must be documented in both `AGENT.md` and `README.md` (alphabetically sorted)
- Memory-modifying operations commit via `formatCommitBody()` in `src/index.ts`

## Testing conventions

- Migration tests must call `assertMigrationIdempotent()` — second run must modify nothing
- New frontmatter fields need: read-old-note test, write-new-note test, migration test
- MCP integration tests stay CI-safe: `DISABLE_GIT=true`, temp `VAULT_PATH`, fake Ollama URL
- Coverage targets: migrations 100%, storage read/write 100%, vault routing 90%+
