---
title: mnemonic — key design decisions
tags:
  - design
  - decisions
  - architecture
  - rationale
lifecycle: permanent
createdAt: '2026-03-07T17:59:12.124Z'
updatedAt: '2026-04-26T10:07:54.583Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mnemonic-project-overview-and-purpose-763b7a51
    type: explains
  - id: project-memory-policy-defaults-storage-location-f563f634
    type: related-to
  - id: dynamic-project-context-loading-plan-9f2ed29c
    type: related-to
  - id: mnemonic-git-commit-protocol-standardization-f2ee3d5e
    type: related-to
  - id: project-identity-remote-override-for-forked-repos-8203a311
    type: related-to
  - id: remember-tool-checkedforexisting-is-schema-only-agent-hint-w-a2c94093
    type: related-to
  - id: performance-principles-for-file-first-mcp-and-git-backed-wor-4e7d3bc8
    type: related-to
memoryVersion: 1
---
**One file per note:** Critical for git conflict isolation. Never aggregate notes into a single file.

**Embeddings gitignored:** Derived data, always recomputable. Committing them causes unresolvable merge conflicts (can't merge float arrays). `sync` now backfills missing local embeddings for each synced vault, even when no notes were newly pulled, so fresh clones heal automatically once Ollama is available.

**Rebase on pull:** `git pull --rebase` keeps history linear. Don't switch to merge.

**Project ID from git remote URL, not local path:** `project.ts` normalizes remote URLs to stable slugs (e.g. `github-com-acme-myapp`). This makes cross-machine consistency work — local paths differ, remote URLs don't.

**Similarity boost, not hard filter:** `recall` gives project notes +0.15 cosine similarity boost rather than excluding global notes. Global memories (user prefs, cross-project patterns) remain accessible in project context.

**Temporal recall is semantic-first and opt-in:** `recall` supports `mode: "temporal"` for on-demand history exploration, but only after normal semantic selection. Default recall behavior and latency expectations stay unchanged. Temporal enrichment is bounded to top matches and compact commit summaries; `verbose: true` adds richer stats-based context, not raw diffs.

**No auto-relationship via LLM:** Decided against using a local Qwen model to auto-build relationships. Small models lack session context, produce spurious edges, and corrupt the graph silently. Instead: agent instructions prompt `relate` immediately after `remember` while session context is warm.

**Metadata-only changes don't re-embed:** Lifecycle migrations and other metadata-only edits do not recompute embeddings. Embeddings refresh when note title/content changes, during sync backfill, or via explicit `reindex`.
