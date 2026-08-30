---
title: >-
  MCP versus CLI for mnemonic: research findings and boundary recommendation
  (consolidated)
tags:
  - workflow
  - research
  - mcp
  - cli
  - skill-improvement
  - known-gaps
  - request
lifecycle: permanent
createdAt: '2026-08-30T11:24:20.488Z'
updatedAt: '2026-08-30T11:24:34.566Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: import-claude-memory-cli-command-design-and-implementation-dcdc5a05
    type: related-to
memoryVersion: 1
---
Consolidate the MCP-versus-CLI research into a permanent product-boundary record; the recommendation (MCP canonical, narrow operational CLI, no 1:1 mirror) was previously captured nowhere.

Research verdict on the MCP-versus-CLI debate for mnemonic (five sources analyzed): protocol branding is secondary to interface design and tool-surface entropy. Recommendation — pending user validation, no implementation authorized — is to keep MCP as mnemonic's canonical agent API, add a narrow read-only/operational CLI surface, and do not build a one-to-one CLI mirror of the MCP tools.

## Key findings

- Zechner's terminalcp benchmark (one narrow stateful-tool domain): MCP was 23% faster and ~2.5% cheaper than CLI, largely because host shell-security/malicious-command detection overhead taxed Bash invocations — evidence that well-designed MCP beats CLI under that overhead, not a universal protocol verdict. His own conclusion: tool design, documentation quality, and token efficiency matter more than protocol; if users already have a shell, build a good CLI first.
- Tool-surface entropy (kb4ai): the size, unpredictability, and selection cost of the action space drives token waste, ambiguous tool selection, and error-recovery loops — for MCP registries and overgrown CLIs alike. A small precise MCP can be low-entropy; a sprawling CLI can be high-entropy.
- CLI's durable advantages: composability (pipes, jq/grep, local filtering so large outputs never enter model context), human inspectability and audit (run the exact command the agent ran), simpler debugging, reuse of shell auth conventions, portability to clients without MCP support.
- MCP's durable advantages: structured schemas, standardized discovery, stateful services, clients without a shell.

## Product boundary for mnemonic

- MCP stays canonical for: project-aware recall, note create/update/delete, relationships, consolidation, attachment management, sync (embeddings, commits, pushes) — this is where agent-facing structured output and workflow-safety sequencing live
- CLI adds value for: humans inspecting/troubleshooting vault state, shell scripts and CI checks, migration and bulk import — `migrate` and `import-claude-memory` already ship as CLI commands
- Candidates (in priority order of evidence): read-only `status`/`doctor` reporting vault path, project identity, migration state, git availability, embedding configuration/readiness, attachment health; machine-readable `--json` output modes; keep `sync` MCP-only initially
- A small bundled `mnemonic-cli` skill should teach the boundary — CLI for installation/diagnostics/migration/import, MCP for memory operations; prefer `--dry-run` before mutating CLI commands; pass `--cwd` for project-scoped operations; never bypass MCP safety sequencing by editing `.mnemonic/` files directly. It must remain guidance, not a competing orchestration runtime.
- A full CLI mirror is rejected: two public interfaces whose behavior can drift, plus terminal rendering/interactive confirmation/embedding latency/git push decisions duplicated for every operation.

## Open validation questions (answer before any implementation plan)

Which real users or agent clients lack mnemonic MCP support but can run a CLI? Is primary demand diagnostics, human recall/search, shell composition, or CI automation? Is embedding startup acceptably fast for a CLI recall command? Should diagnostics include attachments and remote/push readiness? Stable human + JSON output modes from the first release?

Consolidated from request root `research-whether-mnemonic-should-add-cli-support-d3cd3239` and findings `research-findings-mcp-versus-cli-for-mnemonic-495d45dc`.
