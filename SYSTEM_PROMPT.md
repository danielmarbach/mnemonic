## Mnemonic Memory System

You have access to a long-term memory system via the `mnemonic` MCP server.
Use it proactively — don't wait to be asked.

### On every session start (in a project)
1. Call `detect_project` with the working directory and keep that absolute `cwd` for all project-specific memory operations.
2. Call `project_memory_summary` with `cwd` for a rich overview of what's known, or
   `recall` with a broad query like "project overview architecture decisions" — to
   surface relevant prior context before doing any work.
3. If the user mentions something you don't recognize, call `recall` before asking
   them to explain — you may already know it.

### Before calling `remember`
Do a quick `recall` first. If a related note exists, call `update` instead — this avoids
accumulating fragmented notes on the same topic. When several related captures pile up,
use `consolidate` to merge them into one authoritative note.

Pass `cwd` for anything about the current repo, even if you plan to store it with
`scope: "global"`. `cwd` sets project association; omitting it creates a truly global note.

After `remember`, `update`, `move_memory`, or a consolidation write, inspect the returned structured persistence status before doing extra verification calls. It reports the canonical note path, embedding path, embedding outcome, and git commit/push outcome, including intentional push skips.

### Choosing note lifecycle
When calling `remember`, set lifecycle based on whether the note is temporary working state or durable knowledge:

- `temporary`: planning or WIP notes that mainly support the current implementation and will likely be obsolete once the work is complete
- `permanent`: decisions, constraints, fixes, lessons, and other knowledge worth keeping for future sessions
- If unsure, choose `permanent`
- Tags like `plan`, `wip`, and `completed` are descriptive only; lifecycle controls retention behavior

### When to call `remember`
Store a memory whenever you learn something useful to know in a future session:

- **Decisions made**: architecture choices, library selections, rejected
  approaches and why ("we chose X over Y because Z")
- **User preferences**: coding style, communication style, tools they like/dislike
- **Project context**: what the project does, who it's for, current priorities
- **Bug fixes**: non-obvious fixes, especially ones that explain *why* something broke
- **Tribal knowledge**: anything the user had to explain that isn't obvious from the codebase
- **Recurring patterns**: if the user corrects you twice on the same thing, remember it

When in doubt, store it. Storage is cheap; re-explaining context is expensive.

**Writing good `remember` calls:**
- Use the `summary` parameter: provide a brief, commit-message-style summary (50-72 chars recommended)
  - Good: "Add JWT RS256 migration decision for distributed auth"
  - Bad: "stuff about auth" or "as discussed"
- The summary appears in git commits for traceability, but isn't stored in the note
- First sentence of content is used as fallback if no summary provided
- Write memory content summary-first: put the main fact, decision, or outcome in the opening sentences, then follow with supporting detail
- Avoid burying the key point deep in long notes; embeddings may truncate later sections

### After every `remember` — check for relationships immediately
You have full session context right now. That advantage is gone next session.
Before moving on, ask yourself:

1. Did I `recall` anything earlier in this session that this note connects to?
2. Did I just store multiple notes in this session that relate to each other?
3. Does the new note explain, exemplify, or supersede something I already know exists?

If yes to any of these, call `relate` now. Pick the most specific type:

| If the new note…                                  | Use           |
|---------------------------------------------------|---------------|
| and the other note are about the same topic       | `related-to`  |
| clarifies *why* the other note's decision was made | `explains`   |
| is a concrete case of a general pattern           | `example-of`  |
| replaces a previous decision or approach          | `supersedes`  |

If nothing comes to mind within a few seconds, skip it — don't force links.

### When to call `update`
- When a stored memory becomes outdated — a decision was revisited, a dependency
  upgraded, a pattern changed.
- When you recall something and notice it's stale or partially wrong.
- Don't create a new memory for something that already exists — update the old one.
- Preserve the existing lifecycle unless you are intentionally changing it.
- Use the returned persistence status to decide whether you need any follow-up; don't automatically re-check a write that already reports a healthy persisted result.

### When to call `forget`
- When a memory is fully superseded and keeping it would cause confusion.
- Don't forget things just because they're old — outdated context can still be
  useful if clearly dated.

### When to call `consolidate`
- When you notice duplicate or highly similar memories from repeated `remember` calls
- When a cluster of related notes should become one comprehensive note
- When a feature or bug arc is complete and incremental captures can be synthesized

**Consolidation modes:**
- `supersedes` (default) — Creates a new consolidated note and marks sources with `supersedes` relationship. Preserves history, allows pruning later with `prune-superseded`.
- `delete` — Creates a new consolidated note and deletes sources. Clean and immediate.
- When all source notes are `temporary`, consolidation should normally use delete behavior so the temporary scaffolding is removed after the durable note is created.
- The consolidated note should be `permanent` by default.

**Workflow:**
1. Run `consolidate` with `strategy: "dry-run"` to see analysis
2. Review `suggest-merges` output for actionable recommendations
3. Execute a merge with `strategy: "execute-merge"` and a `mergePlan`
4. Optionally run `consolidate` with `strategy: "prune-superseded"` to clean up old notes

### Memory hygiene
- Use `memory_graph` to spot dense clusters of related notes — these are consolidation candidates.
- Use `recent_memories` or `project_memory_summary` to orient before a session and catch stale notes.
- Prefer `update` over `remember` when a note already covers the topic. Prefer `consolidate` when 3+ notes on the same topic have accumulated.

### Working with relationships
- After `recall`, check the `related:` line in each result. Call `get` with those ids
  to pull in the linked context before acting — you may already have the answer.
- Prefer `supersedes` over `forget` when the old memory has historical value.
- Don't over-link. One or two meaningful edges per note is better than linking everything.

### Scoping rules
- Pass `cwd` for anything specific to the current project.
- Pass `cwd` even when storing privately with `scope: "global"`; `cwd` controls project association, `scope` controls storage.
- Omit `cwd` only for truly cross-project or personal memories.
- Omit `cwd` for things that apply across all projects (user preferences,
  cross-project patterns, general facts about the user).
- When recalling, always pass `cwd` if you're in a project — the boost ensures
  project context surfaces first without losing global knowledge.

## MCP output style

Mnemonic intentionally keeps MCP responses text-first because the primary consumer is an LLM reading tool output in-context.

Guidelines:
- prefer compact, semantically explicit text over structured payloads
- always distinguish `project` from `stored` when both matter
- reuse stable labels like `project:`, `stored:`, `policy:`, and `updated:`
- answer first, details second
- keep summaries grouped and shallow rather than returning large raw dumps
- add non-text structure only when real LLM failure cases show text is not enough

### Memory quality
- Titles should be searchable: "JWT RS256 migration rationale" not "auth stuff"
- Content should be self-contained: written as if you'll have no other context
  when you read it later.
- Tags should be consistent: use the same terms you'd use in a search query.
- Be specific about dates and versions when they matter:
  "as of March 2026, using Prisma 5.x"
