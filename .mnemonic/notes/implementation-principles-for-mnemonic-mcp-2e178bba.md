---
title: Implementation principles for mnemonic MCP
tags:
  - implementation-principles
  - always-load
  - design
  - performance
  - structured-output
  - documentation
lifecycle: permanent
createdAt: '2026-05-09T12:54:02.094Z'
updatedAt: '2026-05-09T12:54:19.746Z'
role: summary
alwaysLoad: true
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: performance-principles-for-file-first-mcp-and-git-backed-wor-4e7d3bc8
    type: related-to
  - id: mnemonic-key-design-decisions-3f2a6273
    type: derives-from
  - id: mcp-workflow-ux-hint-prompt-tool-descriptions-and-session-st-e89a18fc
    type: related-to
  - id: changelog-writing-principles-87cdbc5b
    type: related-to
memoryVersion: 1
---
## Implementation principles for mnemonic MCP

These principles constrain every code change. They are hard requirements, not suggestions. If a plan or implementation violates them, the violation must be fixed before moving on.

### Root design principle

Mnemonic is a file-first, git-backed MCP memory server. No database, no daemon, no always-on service. One `.md` file per note. Embeddings gitignored and always recomputable. Git history is the source of truth for note evolution; markdown frontmatter is the source of truth for note content and metadata.

### I/O and performance principles

- **No new I/O on cold/fallback paths.** If the fast path uses session cache, the fallback must be "omit gracefully" — not "fall back to direct storage access." Adding I/O on a path the plan says should be cold means the implementation violates the plan.
- **Fail-soft to undefined.** When computation fails, omit the field (return `undefined`), never throw. Callers and Zod schemas must treat all diagnostic fields as optional.
- **Derive from already-in-memory data.** New structured output fields must reuse session cache, projections, or frontmatter. If the data is not already in memory at the point of computation, the design must be changed so it is — or the field must be omitted rather than introducing new I/O.
- **Contextual metrics must be populated regardless of caller parameters.** If a field like `recallScopeNoteCount` exists so that agents can decide whether to adjust their behavior, it must be present in every response where project context is available. Gating it behind an incidental condition (like "only when limit equals default") makes it invisible when agents need it most.

### Structured output contract

- **Every new Zod output schema field gets `.describe()`.** Weaker models rely on schema descriptions for correct tool use. A field without a description is invisible to many clients.
- **Every new output field gets a bullet in the tool description `Returns` section.** Stronger models benefit from contextual prose that explains when and how to use the field.
- **Neither alone is sufficient.** Schema descriptions are machine-readable; tool description prose is agent-readable. Both must exist.
- **New output schema fields need integration tests that parse real MCP responses through the exported Zod schema.** This catches handler/schema drift — a class of bugs where the code produces a shape the schema doesn't validate, or vice versa.

### Changelog and documentation sync

- **Changelog is curated, not a commit log.** User-focused, outcome-first, 1-2 sentences max per bullet. Implementation details belong in commit messages, not changelog.
- **When tools change, all three surfaces must stay in sync:** AGENT.md (agent rules + tool table), README.md (user-facing reference), `docs/index.html` (GitHub Pages). Missing any surface is a regression.
- **When structured output changes, the tool description must be updated at the same time.** A schema change without a matching description update is incomplete.

### Plan constraints are hard

- **Performance constraints in a plan ("no new I/O", "fail-soft", "session-cache only") are requirements, not suggestions.** If implementation violates them, the review catches it, but the implementation should have caught it first.
- **Test coverage specified in a plan is the minimum, not the ceiling.** "Unit tests for the limit heuristic" means at least that — not "no tests at all."
