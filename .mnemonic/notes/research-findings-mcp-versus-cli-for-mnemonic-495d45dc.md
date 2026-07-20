---
title: 'Research findings: MCP versus CLI for mnemonic'
tags:
  - workflow
  - research
  - mcp
  - cli
  - skill-improvement
  - known-gaps
lifecycle: temporary
createdAt: '2026-07-20T15:40:09.821Z'
updatedAt: '2026-07-20T15:46:47.898Z'
role: research
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: research-whether-mnemonic-should-add-cli-support-d3cd3239
    type: derives-from
memoryVersion: 1
---
# Research findings: MCP versus CLI for mnemonic

The supplied debate supports a complementary CLI, not an MCP replacement. The decisive variable is tool design and tool-surface entropy, not protocol branding. For mnemonic, the strongest opportunity is a small scriptable CLI for human/operator workflows plus a CLI-oriented skill that teaches agents when to use CLI versus MCP. A one-to-one CLI mirror of all MCP tools should not be the starting point.

## Research question

What can mnemonic learn from the MCP-versus-CLI debate, and is it worth supporting mnemonic as a CLI with an additional skill?

The research compares five supplied sources, then checks their implications against mnemonic's current package, CLI dispatch, MCP tool registry, storage model, and bundled skill installer. The sources mix one narrow benchmark with practitioner arguments and a conceptual framing; they should not be treated as a universal protocol verdict.

## Source analysis

### 1. Mario Zechner: MCP vs CLI benchmark

Source: <https://mariozechner.at/posts/2025-08-15-mcp-vs-cli/>

Zechner built equivalent terminal-control versions of terminalcp as an MCP server and CLI, then evaluated them with Claude Code. The evaluation used three terminal tasks—starting a process, sending input, and retrieving output—and compared terminalcp MCP, terminalcp CLI, tmux, and screen. Each task/tool combination was run repeatedly because model behavior is nondeterministic. This is a useful controlled comparison, but it is still narrow: one domain, one agent harness, and a small task set.

Reported findings:

- terminalcp MCP and terminalcp CLI both achieved 100% success.
- MCP was 23% faster in the reported runs: 51 minutes versus 66 minutes.
- MCP was approximately 2.5% cheaper: $19.45 versus $19.95.
- The MCP version used far fewer Haiku tokens: approximately 35k versus 1.3–2M for the CLI. Zechner attributes this largely to Claude Code's malicious-command detection being triggered on Bash invocations, which adds token use and round trips.
- Screen failed the project-analysis task and finished at 67% overall success.
- Task complexity affected the result: tmux was cheaper on simpler tasks, while terminalcp's cleaner output helped on more complex back-and-forth work.

Interpretation:

The benchmark is evidence that MCP can outperform CLI when the tool is stateful, cleanly designed, and the host imposes shell-security overhead. It is not evidence that MCP is generally superior. Zechner's own conclusion is that tool design, documentation quality, and token efficiency matter more than the protocol. If users already have a shell, he recommends building a good CLI first because it is simpler, portable, and composable; an MCP adapter can be added afterward.

### 2. Mario Zechner: What if you don't need MCP?

Source: <https://mariozechner.at/posts/2025-11-02-what-if-you-dont-need-mcp/>

Zechner describes browser automation built from small purpose-specific scripts and Bash/code rather than a broad browser MCP server. His criticism is not that MCP cannot work, but that general-purpose servers must expose many tools and return results through the model context. He reports that Playwright MCP exposes 21 tools consuming about 13.7k tokens and Chrome DevTools MCP exposes 26 tools consuming about 18.0k tokens. In a session that already has built-in tools and other MCP servers, that creates discovery and selection burden.

His preferred scripts expose a small command surface such as start, navigate, evaluate JavaScript, screenshot, pick, and cookies. Shell and code make it possible to filter output, persist intermediate results, combine commands, and add a new one-off operation without changing a server protocol. He notes that reusable skills can package the conventions, but this shifts responsibility to the tool author to document and maintain the structure.

Interpretation for mnemonic:

- Avoid exposing every low-level storage capability as a separate agent-facing command.
- Keep output bounded and let the caller select scope, lifecycle, tags, and limits before results reach the model.
- A CLI can be valuable even if most agent interactions stay MCP-based because shell pipelines and local scripts provide a second composition path.
- A skill should explain the boundary; it should not become a second orchestration runtime.

### 3. E.J. Holmes: MCP is dead, long live the CLI

Source: <https://ejholmes.github.io/2026/02/28/mcp-is-dead-long-live-the-cli.html>

Holmes makes the strongest CLI-first argument in the supplied set. His claims are primarily practitioner observations, not independently measured benchmark results. He argues that agents already understand CLIs from training data and that authors still need to document command purpose, arguments, and when to use each tool even when using MCP.

The concrete advantages he emphasizes are:

- Composability through pipes, jq, grep, redirection, and files. His Terraform example filters a large JSON plan locally rather than dumping the whole plan into model context.
- Human inspectability: a user can run the exact command an agent ran and see the same output.
- Simpler debugging: failures do not require decoding MCP transport logs.
- Reuse of existing authentication and command-line conventions.
- Portability across agents and ordinary terminal sessions.

Holmes still concedes that MCP can make sense when there is no CLI equivalent and that standardization may have value in some use cases. The useful takeaway is not the headline that MCP is dead; it is that a product shipping an MCP server without a strong human/script interface may be optimizing for the protocol instead of the user workflow.

### 4. kb4ai: tool-surface entropy

Source: <https://github.com/kb4ai/mcp-considered-suboptimal-pub-kb/blob/master/tool-surface-entropy.md>

The document defines tool-surface entropy as the size, unpredictability, and selection cost of the action space available to the model at a decision point. It describes the consequences of high entropy as:

- more tokens spent on tool definitions and discovery;
- ambiguous tool selection;
- deeper error-recovery loops after choosing the wrong action; and
- context-window poisoning before useful work begins.

Low entropy comes from fewer choices, deterministic dispatch through code or shell, and short recoverable chains. This is a more useful design lens than MCP versus CLI as a binary choice. A badly designed CLI with dozens of ambiguous subcommands can have high entropy, while a small MCP with a few precise tools can have low entropy.

The framing suggests measuring mnemonic's interface by:

- number of exposed choices;
- description/schema token cost;
- ambiguity between recall, list, get, recent, summary, and graph operations;
- number of steps needed to safely mutate a note; and
- size and filtering quality of returned content.

### 5. kb4ai commit 94cd8eb

Source: <https://github.com/kb4ai/mcp-considered-suboptimal-pub-kb/commit/94cd8eb>

This commit adds the tool-surface-entropy document and promotes Carsten Lindstedt's framing into the repository. It establishes provenance for the concept and shows that the repository treats tool-surface entropy as a reusable design lens. It is not an independent benchmark and should not be counted as separate evidence for CLI superiority.

## Cross-source synthesis

The sources agree on several practical points:

1. Protocol is secondary to interface design. Clear descriptions, bounded output, stable conventions, and task-oriented commands matter more than whether transport is MCP or a shell.
2. Composability is CLI's strongest advantage. Local filtering and persistence avoid routing every intermediate result through the model context.
3. MCP's strongest advantages are structured schemas, standardized discovery, stateful services, and integration with clients that do not provide a shell. MCP can also avoid host-specific shell approval/security overhead.
4. Broad tool surfaces create entropy. The problem is not unique to MCP; both a large MCP registry and an overgrown CLI can make selection harder.
5. Claims about speed, cost, and reliability are workload-dependent. The supplied benchmark is encouraging but too narrow to justify a universal decision.

## Current mnemonic evidence

### Existing CLI foundation

- `package.json` already exposes `mnemonic` as a binary pointing to `build/index.js`.
- `src/index.ts` dispatches CLI commands before starting the MCP server. Running `mnemonic` without a command still starts the MCP server for client configuration.
- `src/cli/dispatch.ts` currently exposes only `migrate` and `import-claude-memory`.
- `migrate` supports `--dry-run`, `--list`, and project scoping via `--cwd`.
- `import-claude-memory` supports `--dry-run`, `--cwd`, and a custom Claude home; imports are safe to rerun because duplicate titles are skipped.
- README explicitly documents these as CLI utilities and describes most memory tools as MCP-only.

### Existing MCP surface

`src/tools/index.ts` registers the complete domain surface, including:

- project identity and migration operations;
- `remember`, `recall`, `get`, `update`, `forget`, and `list`;
- tag discovery, recent memories, summaries, and memory graph;
- sync, move, relate, unrelate, and consolidate; and
- attachment management and project memory policy.

These operations are not thin stateless wrappers. They include structured Zod input/output schemas, project-aware `cwd` routing, embedding and cache behavior, relationship semantics, lifecycle/role handling, markdown validation, branch protection, commits, and optional pushes. The MCP descriptions also encode the safe sequence of `recall`/`list` → `get` → `update` or `remember` → `relate`/`consolidate`.

### Existing skill packaging

The package already ships `skills/**` and a separate `mnemonic-install-skills` binary. Skills can be copied or symlinked into Claude, OpenCode, or custom client directories. `mnemonic-rpi-workflow` is already distributed as both a skill and MCP prompt. This makes a CLI-oriented skill a natural additive package feature rather than a new distribution mechanism.

## Product implications

### Strong case for a CLI

A CLI would provide value for:

- humans inspecting and troubleshooting vault state;
- shell scripts and CI checks;
- migration and import workflows;
- machine-readable status and health output;
- composing bounded exports with jq/grep; and
- agents operating in clients that have shell access but no MCP support.

The CLI also improves trust: users can reproduce and audit what an agent did without opening MCP logs.

### Reasons not to mirror every MCP tool

A full CLI mirror would duplicate complex orchestration and create two public interfaces whose behavior can drift. It would also force decisions about terminal rendering, JSON compatibility, interactive confirmation, embedding latency, git pushes, attachment writes, and error semantics for every MCP operation. The MCP API is currently the place where mnemonic's agent-oriented structured output and workflow safety are concentrated.

### Recommended initial boundary

Keep MCP as the canonical agent API. Expand the CLI only where it adds human/script value without duplicating the domain API:

- retain `migrate`;
- retain `import-claude-memory`;
- consider a read-only `status` or `doctor` command;
- consider machine-readable output (`--json`) for diagnostics; and
- keep `sync` MCP-only initially because it can pull, reconcile embeddings, commit, and push.

A status/doctor command could report vault path, project identity, schema/migration state, git availability, embedding configuration/readiness, and attachment health. Its exact scope needs validation against existing helpers and tests before planning implementation.

Human-facing `recall` or search is an open question rather than an immediate recommendation. It could be useful for browsing memory outside an agent, but it would need a deliberate output contract, local embedding startup behavior, scope/cwd semantics, and a decision about whether it is a true CLI capability or merely a text rendering of MCP behavior.

## CLI-oriented skill recommendation

Add a small bundled skill only if it remains guidance, not orchestration. It should teach:

- Use CLI for installation, diagnostics, migration preview/application, and bulk import.
- Use MCP for project-aware recall, note creation/update/deletion, relationships, consolidation, attachment management, and normal sync.
- Prefer `--dry-run` before mutating CLI commands.
- Pass `--cwd` for project-specific operations.
- Use `--json` when composing CLI output in scripts.
- Do not bypass MCP safety sequencing by editing `.mnemonic/` files directly.
- Treat CLI output as human/script output, not a replacement for MCP structured content.
- Load `mnemonic-rpi-workflow` for RPIR artifact handling; the CLI skill should not introduce a competing workflow.

Potential name: `mnemonic-cli`. It should be installable through the existing `mnemonic-install-skills` flow for supported clients and custom target directories.

## Evidence gaps and validation questions

Before creating an implementation plan, validate:

- Which real users or agent clients lack mnemonic MCP support but can run a CLI?
- Is the primary demand diagnostics, human recall/search, shell composition, or CI automation?
- Does starting embeddings make a CLI recall command acceptably fast and reliable?
- What status information can be computed without adding expensive I/O or mutating state?
- Should diagnostics include attachments and remote/push readiness?
- Should CLI output have stable human and JSON modes from the first release?
- What explicit confirmation and dry-run behavior would be required for any future CLI mutation?
- Can a small workload benchmark compare MCP and CLI on recall, filtering, and note authoring rather than terminal control?

## Preliminary recommendation

Proceed with a plan only after user confirmation. The research favors preserving MCP as mnemonic's canonical structured API, adding a narrow read-only/operational CLI surface, and shipping a small CLI-oriented skill. Do not build a one-to-one CLI mirror or claim that CLI is universally superior.

## Sources

- <https://mariozechner.at/posts/2025-08-15-mcp-vs-cli/>
- <https://mariozechner.at/posts/2025-11-02-what-if-you-dont-need-mcp/>
- <https://ejholmes.github.io/2026/02/28/mcp-is-dead-long-live-the-cli.html>
- <https://github.com/kb4ai/mcp-considered-suboptimal-pub-kb/blob/master/tool-surface-entropy.md>
- <https://github.com/kb4ai/mcp-considered-suboptimal-pub-kb/commit/94cd8eb>

## Repository references

- `package.json`
- `src/index.ts`
- `src/cli/dispatch.ts`
- `src/tools/index.ts`
- `src/prompts.ts`
- `scripts/install-skills.mjs`
- `README.md`
- `ARCHITECTURE.md`
- `AGENT.md`
