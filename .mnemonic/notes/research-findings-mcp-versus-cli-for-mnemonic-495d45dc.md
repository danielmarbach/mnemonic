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
updatedAt: '2026-07-20T15:40:17.380Z'
role: research
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: research-whether-mnemonic-should-add-cli-support-d3cd3239
    type: derives-from
memoryVersion: 1
---
The debate supports a complementary CLI, not an MCP replacement. The decisive variable is tool design and tool-surface entropy, not protocol branding. For mnemonic, the best first move is a small scriptable CLI for human/operator workflows plus a CLI-oriented skill that teaches agents when to use CLI versus MCP; do not mirror all MCP tools initially. Mario Zechner's narrow terminal-control evaluation reported 100% success for both terminalcp MCP and CLI; MCP was 23% faster and about 2.5% cheaper in that harness, while CLI invoked shell security checks that caused much higher Haiku token usage. His conclusion is that protocol matters less than tool design, documentation, and token-efficient output, and that a good CLI can be wrapped by MCP. In his browser-tools essay, he cites broad MCP servers at 21 tools/13.7k tokens and 26 tools/18.0k tokens, arguing that small scripts and Bash preserve local filtering, persistence, and composition. E.J. Holmes makes the strongest CLI-first case: pipes, jq, grep, files, human inspectability, and simpler debugging; he still concedes MCP makes sense where no CLI equivalent exists. The kb4ai tool-surface-entropy document defines entropy as the size, unpredictability, and selection cost of the action space; higher entropy increases discovery tokens, selection ambiguity, recovery loops, and context poisoning, while lower entropy comes from deterministic dispatch and short chains. Commit 94cd8eb adds and promotes that framing, but is not an independent benchmark. Source URLs: <https://mariozechner.at/posts/2025-08-15-mcp-vs-cli/> <https://mariozechner.at/posts/2025-11-02-what-if-you-dont-need-mcp/> <https://ejholmes.github.io/2026/02/28/mcp-is-dead-long-live-the-cli.html> <https://github.com/kb4ai/mcp-considered-suboptimal-pub-kb/blob/master/tool-surface-entropy.md> <https://github.com/kb4ai/mcp-considered-suboptimal-pub-kb/commit/94cd8eb>. Repository fit: mnemonic already has a mnemonic binary and dispatch layer but only migrate and import-claude-memory commands; it also ships mnemonic-install-skills with copy/symlink installation for Claude, OpenCode, and custom directories. The complete domain API remains MCP-first in src/tools/index.ts: project-aware recall, remember/update, relationships, consolidation, attachments, policy, and sync depend on structured schemas, cwd routing, embeddings, caches, graph semantics, and mutation/push safeguards. Existing CLI commands demonstrate a safe boundary: explicit, scriptable, dry-run or idempotent operations. A narrow read-only mnemonic status or doctor command could improve observability without duplicating the domain API; candidate diagnostics include vault path, project identity, migration state, git/embedding readiness, and attachment health. Keep sync MCP-only initially because it can pull, reconcile embeddings, commit, and push. Preliminary recommendation: preserve MCP as the canonical agent API; add a small CLI for installation, diagnostics, migration, and bulk import; add a CLI-oriented skill as guidance rather than a second workflow engine; avoid a one-to-one CLI mirror until usage shows demand; measure actual memory workloads before making protocol claims. Open questions: human-facing recall/search, attachment and embedding diagnostic scope, and whether the CLI skill should be bundled for every supported client.
