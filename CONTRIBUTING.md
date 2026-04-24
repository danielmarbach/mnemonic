# Contributing to mnemonic

Thank you for contributing to mnemonic. This guide covers the conventions, workflows, and expectations for working on the project.

## Table of contents

- [Development setup](#development-setup)
- [Dogfooding — highly encouraged](#dogfooding-highly-encouraged)
- [Code style](#code-style)
- [Testing](#testing)
- [Data format and migration changes](#data-format-and-migration-changes)
- [Documentation upkeep](#documentation-upkeep)
- [Commit message protocol](#commit-message-protocol)
- [Pull request guidelines](#pull-request-guidelines)

---

## Development setup

**Prerequisites:** [Ollama](https://ollama.com) running locally with the embedding model pulled.

```bash
ollama pull nomic-embed-text-v2-moe
```

**Install and build:**

```bash
npm install
npm run build   # runs typecheck then tsc
npm test        # run the full test suite
```

`npm run build` already runs `typecheck`, but running it explicitly first (`npm run typecheck`) gives a faster failure loop when iterating.

**Run the local MCP server for dogfooding:**

```bash
npm run mcp:local
# or directly:
scripts/mcp-local.sh
```

This rebuilds from source first, so MCP clients always reflect the latest code.

---

## Dogfooding — highly encouraged

> **It is highly encouraged to dogfood your changes while developing mnemonic.**
> Use the running MCP server to capture design decisions, record surprises, and remember important findings as you go.
> Never write `.mnemonic/` files directly — go through the MCP tools.

Mnemonic is built to be used while being developed. Every non-trivial change to mnemonic's behavior is an opportunity to exercise the tool and verify that it works correctly in practice, not just in tests.

### Workflow

1. **Rebuild before testing manually:** `npm run build` (or `npm run mcp:local` which rebuilds automatically).
2. **Start the local MCP server:** `npm run mcp:local` and point your MCP client at `scripts/mcp-local.sh`.
3. **Use project-scoped memory operations:** pass `cwd` to every `remember`, `recall`, `update`, and `get` call so notes are associated with this repository.
4. **Capture decisions through MCP:** when you make a design decision, discover a bug cause, or land on a non-obvious workaround, call `remember` (or `update` if a related note already exists).

For reproducible dogfooding of recency and relationship-navigation behavior, prefer the isolated dogfood runner over the live project vault. The isolated runner copies the current `.mnemonic` notes into a temporary workspace, runs the chosen pack there, and deletes the workspace afterward. Use `npm run mcp:local` or `scripts/mcp-local.sh` for local dogfooding against the current source tree.

### What to capture

Default to capturing context without waiting for a reminder. In particular, capture when:

- A design or implementation decision is made with a clear "why"
- A bug, CI failure, or environment trap is found
- A workaround or temporary constraint is introduced
- A plan is accepted, rejected, narrowed, or deferred
- Dogfooding reveals behavior that differs from assumptions
- New testing or CI conventions are established
- A migration, data-shape, or operational constraint is clarified

### Before capturing

Before calling `remember`:

1. Call `recall` first — if a related note exists, call `update` instead to avoid fragmentation.
2. Write the note summary-first: put the main fact, decision, or outcome in the opening sentences, then follow with supporting detail.
3. Choose the lifecycle intentionally:
   - `lifecycle: "temporary"` — working-state notes (WIP checkpoints, draft next steps, unvalidated ideas).
   - `lifecycle: "permanent"` — durable knowledge (decisions and rationale, bug causes, architecture notes, reusable lessons). **If unsure, prefer `permanent`.**

### Memory hygiene

Consolidate when:

- 3+ notes on the same topic have accumulated
- A feature or bug arc is complete and related notes can be synthesized
- `memory_graph` shows a dense cluster of tightly related nodes

### End-of-session check

Before finishing substantial work, ask:

- What should future work remember about this change?
- Was any option deliberately rejected and why?
- Did CI or local dogfooding reveal a non-obvious lesson?
- Is there a new convention that should live in memory or `AGENT.md`?

If the answer to any of these is yes, capture it through MCP before wrapping up.

### Data format changes must be applied to the live vault

Every change to the note format, frontmatter schema, or migration logic must be applied to mnemonic's own `.mnemonic/` vault before merging:

1. Implement the change with tests.
2. Run the migration in dry-run mode.
3. Execute the actual migration.
4. Verify notes are correctly updated.
5. Commit the migrated notes — this shows real-world impact in the diff.

---

## Code style

- **TypeScript** with explicit types at function boundaries; infer elsewhere.
- **Exhaustive switch statements** using `never` for union types:

  ```typescript
  switch (mode) {
    case "delete":
      break;
    case "supersedes":
      break;
    default: {
      const _exhaustive: never = mode;
      throw new Error(`Unknown mode: ${_exhaustive}`);
    }
  }
  ```

- **String literal unions** over enums:

  ```typescript
  type ConsolidationMode = "supersedes" | "delete";
  ```

- **`unknown` for dynamic/external data**, not `any`. Forces explicit narrowing before use.

---

## Testing

Run tests with:

```bash
npm test                          # all tests
npm test -- <file>                # specific test file
npm test -- --reporter=verbose    # detailed output
```

### General expectations

| Area | Coverage target |
|------|----------------|
| Migration code | 100% |
| Storage read/write | 100% |
| Vault routing | 90%+ |
| Frontmatter parsing | 100% |

### CI-safe MCP integration tests

`tests/mcp.integration.test.ts` must stay CI-safe:

- Use the real `scripts/mcp-local.sh` entrypoint.
- Set `DISABLE_GIT=true`, a temp `VAULT_PATH`, and a fake `OLLAMA_URL`.
- Never require a live Ollama daemon in CI.

If you add MCP integration tests, follow the same hermetic pattern unless you explicitly need end-to-end Ollama verification.

When changing a tool's `structuredContent` shape or zod `outputSchema`, add or update a schema-audit test that parses the real MCP response with the exported schema. Treat handler/schema drift as a regression class to guard explicitly.

### Release confidence gate

Before releasing, run the full release verification gate:

```bash
npm run verify:release
```

This runs build + full tests + isolated dogfood packs in one command. The isolated dogfood step uses a temporary copied vault and cleans up automatically, so it is safe to run repeatedly.

---

## Data format and migration changes

Any change to note format, frontmatter schema, config structure, or relationships requires tests:

- **New frontmatter fields:** test reading old notes without the field (default), test writing new notes (field present), test migration path if needed.
- **Field renames:** test migration, test both old and new field names during transition.
- **New note versions:** test `parseNote()` handles missing `memoryVersion` gracefully.
- **Config changes:** test `MnemonicConfigStore` handles old configs and validates new fields.
- **Relationship changes:** test bidirectional consistency, cleanup on `forget`, and type validation.

### Migration testing pattern

See `tests/migration.test.ts` and `tests/migration-helpers.ts`.

- Test dry-run mode shows correct changes.
- Test execute mode modifies notes correctly.
- **Every migration MUST call `assertMigrationIdempotent()`** — run twice, second run must modify nothing. This is required because project vaults may be migrated independently of the main vault's schema version.
- Test version comparison logic for all version schemes (`0.1`, `0.2`, `1.0`, etc.).
- Test error handling for malformed data.
- Test per-vault isolation (project vault succeeds, main vault fails = OK).
- When adding a new latest-schema migration, bump `defaultConfig.schemaVersion` in `src/config.ts` at the same time so fresh installs start at the current schema.

---

## Documentation upkeep

Keep these files aligned:

| File | Audience | Canonical content |
|------|----------|------------------|
| `README.md` | End users | Setup, install, MCP config, tools table, env vars |
| `AGENT.md` | Agents and developers | Dogfooding protocol, full tool inventory, design decisions, constraints |
| `ARCHITECTURE.md` | System map | Control flow, source layout, vault behavior, data model, diagrams |
| `SYSTEM_PROMPT.md` | LLM system prompt | Agent-facing system prompt |
| `docs/index.html` | GitHub Pages landing page | Tools, dogfooding section, config table, setup snippets |

Rules:

- **New MCP tools** must be added to both the `AGENT.md` and `README.md` tools tables (alphabetically sorted).
- **`ARCHITECTURE.md`** must be updated whenever control flow, source layout, vault behavior, data model, or major architectural decisions change.
- **`docs/index.html`** tools table, dogfooding section, and configuration table must stay current when tools, features, or relevant `.mnemonic/notes/` change.
- When a concept is easier to understand visually, add or refresh a Mermaid diagram in `ARCHITECTURE.md`.

---

## Commit message protocol

Memory-modifying MCP tools use standardized commits via `formatCommitBody()` in `src/index.ts`:

```
tool(action): Brief description

Human-readable summary.

- Note: <id> (<title>)
- Project: <project-name>
- Scope: project|global
- Tags: <tag1>, <tag2>
```

For regular code commits, use the same imperative-mood, 50–72 character subject line style. Explain the "why" in the body when the reason is not obvious from the diff.

---

## Pull request guidelines

- Keep changes focused and minimal. One logical change per PR is easier to review and revert.
- Update `ARCHITECTURE.md`, `AGENT.md`, and `README.md` if the change affects tools, behavior, or data format.
- Verify tests pass locally (`npm test`) before opening a PR.
- If you dogfooded the change, include a brief note in the PR description about what you observed during local testing.
- New MCP tools need documentation in both `AGENT.md` and `README.md` before the PR can be merged.
