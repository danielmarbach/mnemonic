# GitHub Copilot Instructions for mnemonic

## Project overview

mnemonic is a local MCP memory server that stores LLM memories as plain markdown in a git repo
with local embeddings via Ollama. Design decisions, architecture notes, and learnings are captured
as structured notes in `.mnemonic/notes/`.

## PR title and description generation

When generating or updating a PR title and description, always look for mnemonic design decision
notes changed in the PR.

### How to find relevant context

1. Check the PR diff for any files under `.mnemonic/notes/` — these are structured design decision
   notes written by the author during the session that produced the PR.
2. Read the YAML frontmatter (`title`, `tags`, `lifecycle`) and the markdown body of each note.
3. Notes tagged `decision`, `design`, `architecture`, or `rationale` are the most relevant for
   PR descriptions. Notes tagged `plan` or `wip` provide context for work still in progress.

### PR title format

- Imperative mood, present tense (e.g. "Add", "Fix", "Implement", "Refactor", "Extract")
- Specific: what changed and why it matters
- If a single primary mnemonic note exists, its `title` field can directly guide the PR title
- If multiple notes exist, derive the title from the dominant theme across notes
- Under 72 characters

**Examples from this repo:**
- `Add lifecycle field to distinguish temporary from permanent notes`
- `Implement bidirectional sync with embedding backfill`
- `Fix consolidate scope bug that excluded cross-scope notes`

### PR description format

Use this structure when writing a PR description from mnemonic notes:

```markdown
## Summary

[1–2 sentences: the core change and its motivation, derived from the notes]

## Design Decisions

[For each mnemonic note changed in the PR:]

### [Note title]

[Key decisions and rationale from the note body. Preserve the note's own structure
(headings, bullet points). Focus on the "why" — alternatives considered, constraints,
tradeoffs — not just what was implemented.]

---

_Generated from N design decision note(s) in `.mnemonic/notes/`. Run `/update-pr` to regenerate._
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
