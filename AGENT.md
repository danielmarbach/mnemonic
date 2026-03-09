# mnemonic — Agent Context

⚠️ **WHEN WORKING ON MNEMONIC: Always test changes with local MCP server first (`npm run mcp:local` or `scripts/mcp-local.sh`)**

A personal MCP memory server. Stores LLM memories as plain markdown in a git repo with local embeddings via Ollama. No database or permanent services required.

## Dogfooding protocol

When working on mnemonic itself:
- Rebuild first: `npm run build`
- Use local MCP: `npm run mcp:local` or `scripts/mcp-local.sh`
- Use project-scoped `mnemonic` MCP for memory operations
- Exercise features through MCP tools (`remember`, `update`, `get`, `relate`, `recall`)
- Mnemoize decisions and findings through MCP (never write `.mnemonic/` files directly)

### Session start

Before doing any substantive work:
1. Resolve the active project context first; if you are in a repo, treat its absolute working directory as required input for project-scoped memory operations.
2. Call `project_memory_summary` (or `recent_memories`) with `cwd` to orient on what's already known.
3. Call `recall` with `cwd` and a broad query to surface relevant prior context.

### Before capturing

Before calling `remember`:
1. `recall` first — if a related note exists, call `update` instead to avoid fragmentation.
2. If you've made several closely-related captures in this session, consider `consolidate` before wrapping up.
3. Write the note summary-first: put the main fact, decision, or outcome in the opening sentences, then follow with supporting detail.
4. Pass `cwd` for anything about the current repo, even if you intend to store it in the main vault with `scope: "global"`.
5. Omit `cwd` only for truly cross-project or personal memories; missing `cwd` makes the note global and unassociated.
6. After `remember`, `update`, `move_memory`, or consolidation writes, inspect the returned structured persistence status before doing extra verification calls. It tells you the note path, embedding path, embedding outcome, and git commit/push outcome.

### Choosing note lifecycle

When storing a memory, choose the lifecycle intentionally:

- Use `lifecycle: "temporary"` for working-state notes that mainly help during active execution and will likely lose value once the work is complete. Examples: accepted implementation plans, WIP checkpoints, temporary investigation state, draft next steps.
- Use `lifecycle: "permanent"` for durable knowledge that future sessions should keep even after the current task is done. Examples: decisions and rationale, discovered constraints, bug causes, workarounds, architecture notes, reusable lessons.
- If unsure, prefer `permanent`.
- Tags like `plan`, `wip`, and `completed` are descriptive only. They do not control cleanup behavior.

### Capture triggers

Default to capturing important context through MCP without waiting to be reminded. In particular, capture when any of the following happens:

- A design or implementation decision is made and there is a clear "why"
- A bug, CI failure, portability issue, or environment trap is discovered
- A workaround or temporary constraint is introduced
- A plan is explicitly accepted, rejected, narrowed, or deferred
- Dogfooding reveals behavior that differs from assumptions
- New testing or CI conventions are established
- A migration, data-shape, or operational constraint is clarified

### End-of-task memory check

Before finishing substantial work on mnemonic, quickly check:

- What should future work remember about this change?
- Was any option deliberately rejected and why?
- Did CI, local dogfooding, or production-like use reveal a non-obvious lesson?
- Is there a new convention that should be documented in memory or `AGENT.md`?

If the answer to any of these is yes, capture it through MCP before wrapping up.

### Memory hygiene

Consolidate when:
- 3+ notes on the same topic have accumulated from incremental captures
- A feature or bug arc is complete and related notes can be synthesized into one
- `memory_graph` shows a dense cluster of tightly-related nodes

Use `consolidate` strategy `supersedes` to preserve source history (sources remain with `supersedes` relationship, cleanable later via `prune-superseded`); use `delete` to remove sources immediately.

When consolidating:
- If all source notes are `temporary`, prefer delete behavior so the temporary scaffolding disappears once the durable note exists.
- Consolidated notes should be `permanent` by default.

When calling `update`:
- Preserve the existing lifecycle unless you are intentionally changing it.
- Do not switch a note between `temporary` and `permanent` implicitly.

### Documentation upkeep

- `ARCHITECTURE.md` is the canonical high-level map of the system; update it whenever control flow, source layout, vault behavior, data model, CI/MCP operational patterns, or major architectural decisions change
- Keep `ARCHITECTURE.md`, `AGENT.md`, and `README.md` aligned: architecture detail in `ARCHITECTURE.md`, agent workflow rules in `AGENT.md`, and reader-facing overview links in `README.md`
- When a new concept is easier to understand visually, add or refresh a Mermaid diagram in `ARCHITECTURE.md`
- `docs/index.html` is the GitHub Pages landing page; keep it current whenever tools, features, or the dogfooding notes change:
  - Tools table in the **Tools** section must reflect the current tool inventory (same as README.md and AGENT.md)
  - The **Dogfooding** section shows real notes from `.mnemonic/notes/` — refresh card content if those notes are updated or replaced
  - Configuration table (`VAULT_PATH`, `OLLAMA_URL`, `EMBED_MODEL`, `DISABLE_GIT`) must match env vars in code and README.md
  - The setup snippets and the `AGENT.md` / system prompt snippet must stay in sync with the copy-paste versions in `README.md`
  - The hero terminal shows a real `recall` result — update if the note it references changes significantly

**Troubleshooting:** Complex JSON payloads may fail via stdio due to shell escaping. Write to temp file first:
```bash
cat > /tmp/request.json << 'JSON'
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{...}}
JSON
(
  echo '{"jsonrpc":"2.0","id":0,"method":"initialize",...}'
  cat /tmp/request.json
) | ./scripts/mcp-local.sh
```

## Git commit message protocol

All memory-modifying tools follow standardized commits via `formatCommitBody()` in `src/index.ts`:

```
tool(action): Brief description

Human-readable summary.

- Note: <id> (<title>)
- Notes: <count> notes affected
  - <id-1>
  - <id-2>
- Project: <project-name>
- Scope: project|global
- Tags: <tag1>, <tag2>
- Relationship: <from-id> <type> <to-id>
- Mode: <mode>
- Description: <additional context>
```

### Tool conventions

| Tool | Subject format | Summary source | Body fields |
|------|----------------|----------------|-------------|
| `remember` | `remember: <title>` | `summary` param or first sentence | Summary, Note, Project, Scope, Tags |
| `update` | `update: <title>` | `summary` param or "Updated X, Y, Z" | Summary, Note, Project, Tags |
| `forget` | `forget: <title>` | "Deleted note and cleaned up N reference(s)" | Summary, Note, Project |
| `move` | `move: <title>` | "Moved from X-vault to Y-vault" | Summary, Note, Project |
| `relate` | `relate: <title1> ↔ <title2>` | Context of relationship | Summary, Note, Project, Relationship |
| `unrelate` | `unrelate: <id1> ↔ <id2>` | Context of removal | Summary, Note, Project |
| `identity` | `identity: <project> use remote <remote>` | "Use X as canonical project identity" | Summary, Project |
| `consolidate` | `consolidate(<mode>): <title>` | `mergePlan.summary` or "Consolidated N notes" | Summary, Note(s), Project, Mode |
| `consolidate` (prune-superseded) | `prune: removed N superseded note(s)` | "Pruned N superseded notes" | Summary, Note(s) |
| `policy` | `policy: <project> default scope <scope>` | "Set default scope to X" | Summary, Project |

**LLM summary format:** Imperative mood, 50-72 chars, explain "why" not "what".

## Design decisions

### Markdown + YAML frontmatter
- Human-readable, git-diffable, one file per note (isolated conflicts), no lock-in

### Embeddings gitignored
- Derived data, recomputable; avoids binary merge conflicts
- Reindex on new machine is fast at personal scale
- `sync` auto-embeds pulled notes

### Project scoping via git remote URL
```
git@github.com:acme/myapp.git → github-com-acme-myapp
https://github.com/acme/myapp → github-com-acme-myapp
```
Ensures consistency across machines. Default remote is `origin`; for forks, `set_project_identity` can switch identity resolution to another remote such as `upstream`. Fallback: git remote → git root folder → directory name.

### Project-boosted recall
When `recall` called with `cwd`, project notes get **+0.15 cosine similarity boost** (not hard filter). Keeps global memories accessible while prioritizing project context.

### Multi-vault architecture
- **Main vault** (`~/mnemonic-vault`): Private global memories, own git repo
- **Project vault** (`<git-root>/.mnemonic/`): Project-specific memories, committed to project repo

### Routing rules
- `cwd` identifies project context (separate from write location)
- Treat `cwd` as mandatory for project-specific `remember`, `recall`, `update`, `move_memory`, `get`, `list`, `sync`, and `reindex` calls
- `remember` + `scope: "project"` → project vault (creates `.mnemonic/`)
- `remember` + `scope: "global"` → main vault (keeps project in frontmatter)
- `scope` omitted → use saved policy or fallback to `project` with `cwd`
- Policy `ask` → ask: "Project vault" or "Private main vault"
- `remember` without `cwd` → main vault
- `move_memory` main-vault → project-vault rewrites `project` / `projectName` from `cwd`
- `move_memory` project-vault → main-vault preserves project association while changing storage
- `recall`, `list`, `get`, `sync`, `reindex` → project vault first, then main
- `relate`/`unrelate`/`forget` → any vault, commit per vault
- Main vault's own git repo excluded from detection (`isMainRepo()` guard)

### Main vault config
Machine-local settings in `~/mnemonic-vault/config.json`. Survives sessions without becoming memory notes. Includes `reindexEmbedConcurrency`, per-project policy defaults, and optional project-identity remote overrides for fork workflows.

### Bidirectional sync
`sync` does: fetch → record HEAD → pull (rebase) → diff notes/ → push → embed arrivals. Single call, linear history. Syncs main vault; pass `cwd` for project vault too.

### MCP output style
Optimized for LLM consumption:

**Output rules:**
- Compact, semantically explicit text over structured payloads
- Always name **project association** and **storage location**
- Use stable labels: `project:`, `stored:`, `policy:`, `updated:`
- Answer first, then detail
- Shallow lists grouped by purpose
- Structured responses only if text fails repeatedly

**Token-efficiency:**
- Clarity first, tokens second
- Concise defaults, opt-in detail
- One summary tool over multiple calls
- Compress counts/state into single readable lines
- Don't over-shorten labels

**Formatting:**
- Short headings for orientation
- Bullets for enumerations/state
- Consistent wording for `project`, `scope`, `stored`, `policy`
- Explicit phrases: `project: mnemonic`, `stored: main-vault`

## Architecture

`ARCHITECTURE.md` is the canonical system map. Read it before making structural changes.

Keep these high-level anchors in mind:

- `src/index.ts` is the MCP entry point and orchestration layer
- `src/vault.ts` routes between the main vault and project vaults
- `src/storage.ts` owns markdown notes and embedding JSON persistence
- `src/git.ts` makes git part of normal mutating behavior
- `src/migration.ts` owns schema evolution and dry-run-first migration flow
- `src/recall.ts` and `src/consolidate.ts` hold behavior that intentionally stays lightweight instead of introducing heavier runtime state

## Tools

⚠️ **When adding new tools**: Always document them in both the Tools table below AND in README.md. Keep the tables in sync and sorted alphabetically.

| Tool | Description |
|------|-------------|
| `consolidate` | Merge multiple notes into one with relationship to sources |
| `detect_project` | Resolve `cwd` to stable project id via git remote URL |
| `execute_migration` | Execute a named migration (supports dry-run) |
| `forget` | Delete note + embedding, git commit + push, cleanup relationships |
| `get` | Fetch one or more notes by exact id |
| `get_project_identity` | Show effective project identity and remote override |
| `get_project_memory_policy` | Show saved default write scope |
| `list` | List notes filtered by scope/tags/storage |
| `list_migrations` | List available migrations and pending count |
| `memory_graph` | Show compact adjacency list of relationships |
| `move_memory` | Move note between vaults without changing id |
| `project_memory_summary` | Summarize what mnemonic knows about a project |
| `recall` | Semantic search with optional project boost |
| `recent_memories` | Show most recently updated notes for scope |
| `reindex` | Rebuild missing embeddings; `force=true` rebuilds all |
| `remember` | Write note + embedding; `cwd` sets context, `scope` picks storage, `lifecycle` picks temporary vs permanent |
| `relate` | Create typed relationship between notes (bidirectional) |
| `set_project_identity` | Save which git remote defines project identity |
| `set_project_memory_policy` | Save default write scope for project (`project`, `global`, `ask`) |
| `sync` | Bidirectional git sync, pull, push, auto-embed pulled notes |
| `unrelate` | Remove relationship between notes |
| `update` | Update note content/title/tags/lifecycle, re-embeds always |
| `where_is_memory` | Show note's project association and storage location |

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VAULT_PATH` | `~/mnemonic-vault` | Vault location |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama server |
| `EMBED_MODEL` | `nomic-embed-text-v2-moe` | Embedding model |
| `DISABLE_GIT` | `false` | Skip git ops if `"true"` |

## Stack

- **TypeScript** (Node16, ES2022)
- **@modelcontextprotocol/sdk** — MCP server
- **simple-git** — git operations
- **gray-matter** — markdown frontmatter parsing
- **zod** — schema validation
- **Ollama** (HTTP) — `nomic-embed-text-v2-moe` embeddings via `/api/embed` with truncation enabled

## TypeScript patterns

### Exhaustive switch statements
```typescript
switch (consolidationMode) {
  case "delete":
    // handle
    break;
  case "supersedes":
    // handle
    break;
  default: {
    const _exhaustive: never = consolidationMode;
    throw new Error(`Unknown mode: ${_exhaustive}`);
  }
}
```

### String literal unions
```typescript
type ConsolidationMode = "supersedes" | "delete";
```

Prefer over enums — more lightweight, integrates better with JSON.

### Type inference
Let TypeScript infer when obvious; explicit types for function boundaries and public APIs.

### Unknown for dynamic data
Use `unknown` instead of `any` for external data (APIs, user input). Forces type checking before use.

## Testing Requirements

### Data format changes MUST have tests
Any change to note format, frontmatter schema, config structure, or relationships requires corresponding tests:

- **New frontmatter fields**: Test reading old notes without the field (should default), test writing new notes (include field), test migration path if needed
- **Field renames**: Test migration that renames field, test both old and new field names during transition period
- **New note versions**: Test `parseNote()` handles missing `memoryVersion` gracefully 
- **Config changes**: Test `MnemonicConfigStore` handles old configs, validates new fields
- **Relationship changes**: Test bidirectional consistency, cleanup on `forget`, validation of types

**Migration testing pattern** (see `tests/migration.test.ts`):
- Test dry-run mode shows correct changes
- Test execute mode modifies notes correctly
- **Test idempotency with `assertMigrationIdempotent()` from `tests/migration-helpers.ts`** — every migration MUST pass this check (run twice, second run modifies nothing). This is required because project vaults may be migrated independently of the main vault's schema version, causing re-runs.
- Test version comparison logic for all version schemes (0.1, 0.2, 1.0, etc.)
- Test error handling for malformed data
- Test per-vault isolation (project vault succeeds, main vault fails = OK)
- When adding a new latest-schema migration, bump `defaultConfig.schemaVersion` in `src/config.ts` at the same time so fresh installs start at the current schema.

**Test files mirrored to source structure**:
- `src/storage.ts` → `tests/storage.test.ts` (doesn't exist yet, add when needed)
- `src/vault.ts` → `tests/vault.test.ts`
- `src/migration.ts` → `tests/migration.test.ts`

**Running tests**:
```bash
npm test                    # all tests
npm test -- <file>          # specific test file
npm test -- --reporter=verbose  # detailed output
```

**CI-safe MCP testing and learning**:
- `tests/mcp.integration.test.ts` should remain CI-safe: use the real `scripts/mcp-local.sh` entrypoint, `DISABLE_GIT=true`, a temp `VAULT_PATH`, and a fake local `OLLAMA_URL` endpoint
- If you add more MCP integration tests, prefer the same hermetic pattern unless you explicitly need end-to-end Ollama verification
- CI failure learnings are artifact-first: a failing run should produce normalized artifacts before anything is promoted into memory
- Promotion into mnemonic is manual via `workflow_dispatch`, not automatic on every failed run
- Avoid fixed notes for CI learnings; prefer one note per promoted incident or failure pattern with a stable `failure_signature`
- Do not make CI failure learning depend on a real Ollama daemon unless semantic clustering becomes a proven need

**Coverage expectations**:
- Migration code: 100% (users can't fix corrupt vaults easily)
- Storage read/write: 100% (data integrity is critical)
- Vault routing: 90%+ (core to correct note storage/retrieval)
- Frontmatter parsing: 100% (must handle malformed gracefully)

### Dogfooding required
Every data format change must be applied to mnemonic's own `.mnemonic/` vault before merging:
1. Implement change with tests
2. Run migration in dry-run mode
3. Execute actual migration
4. Verify notes correctly updated
5. Commit the migrated notes (shows real-world impact)

### Documentation for new tools
All new MCP tools MUST be documented in both AGENT.md and README.md:

- Add to Tools table in **AGENT.md** (keep alphabetically sorted)
- Add to Tools table in **README.md** (keep alphabetically sorted)
- Document all parameters in AGENT.md with clear types and descriptions
- Update example usage in README.md if applicable
- Run `npm test` to ensure no regressions

**Keep README.md and AGENT.md in sync** - they serve different audiences (README.md for users, AGENT.md for agents/developers).

## Critical constraints

- **One file per note** — git conflict isolation
- **Embeddings gitignored** — avoid binary merge conflicts; reindex if needed
- **Rebase on pull** — linear history
- **Project id from git remote URL** — cross-machine consistency
- **Similarity boost (not hard filter)** — keep global memories accessible
- **`simpleGit()` in `GitOps.init()`** — vault must exist first
- **Project vault in `.mnemonic/`** — shareable via git
- **`isMainRepo()` guard** — prevent main vault from being treated as project vault

## Known limitations

- **Bounded parallel embedding** — small concurrency limit during reindex
- **No full-text fallback** — fails if Ollama down (could add keyword search)
- **Embedding model mismatch** — `reindex --force` fixes; no auto-detection
- **No web UI** — vault is just files; use any markdown editor
