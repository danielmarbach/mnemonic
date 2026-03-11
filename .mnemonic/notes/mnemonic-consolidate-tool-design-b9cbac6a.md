---
title: mnemonic consolidate tool design
tags:
  - design
  - consolidation
  - mcp-tool
  - architecture
lifecycle: permanent
createdAt: '2026-03-07T23:15:43.251Z'
updatedAt: '2026-03-11T11:07:16.639Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mnemonic-key-design-decisions-3f2a6273
    type: related-to
  - id: mnemonic-mcp-tools-inventory-47499799
    type: explains
  - id: agent-instruction-improvements-session-start-recall-first-an-ecd402c3
    type: example-of
  - id: execute-merge-scope-bug-projectnotes-filter-excludes-cross-s-99d357af
    type: explains
memoryVersion: 1
---
New MCP tool `consolidate` for memory consolidation with cross-vault support.

**Purpose:** Analyze and consolidate memories by detecting duplicates, identifying clusters, and merging related notes while preserving relationships.

**Strategies:**

- `detect-duplicates` — Find semantically similar notes (>0.85 similarity)
- `find-clusters` — Group notes by theme and relationship density
- `suggest-merges` — Recommend specific merges with rationale
- `execute-merge` — Perform consolidation with chosen mode
- `prune-superseded` — Clean up superseded chains, keep only latest
- `dry-run` — Preview all strategies without changes

**Consolidation Modes:**

- `supersedes` (default) — Keep sources, add `supersedes` relationship to new consolidated note. Preserves history with clear lineage. Can prune later with `prune-superseded`.
- `delete` — Hard delete sources via `forget`. Clean immediate results, irreversible.

**Cross-Vault Behavior:**

- Gather ALL notes with matching project ID from both main vault and project vault
- Consolidate into project vault (shared knowledge)
- Apply same mode to all sources regardless of original vault
- Consolidated note inherits all relationships from sources

**Project Policy Extension:**
Add `consolidationMode` to `ProjectMemoryPolicy` with default `supersedes`. Stored in main vault config.json.

**Safety Features:**

- Dry-run by default for analysis strategies
- Git commit per operation for easy revert
- Shows exactly what will happen before changes
