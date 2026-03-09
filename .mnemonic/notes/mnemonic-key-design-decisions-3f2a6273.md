---
title: mnemonic — key design decisions
tags:
  - design
  - decisions
  - architecture
  - rationale
lifecycle: permanent
createdAt: '2026-03-07T17:59:12.124Z'
updatedAt: '2026-03-08T14:08:04.842Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mnemonic-project-overview-and-purpose-763b7a51
    type: explains
  - id: markdown-linting-for-memory-content-259a1c85
    type: related-to
  - id: project-memory-policy-defaults-storage-location-f563f634
    type: related-to
  - id: dynamic-project-context-loading-plan-9f2ed29c
    type: related-to
  - id: mnemonic-consolidate-tool-design-b9cbac6a
    type: related-to
  - id: mnemonic-git-commit-protocol-standardization-f2ee3d5e
    type: related-to
  - id: project-identity-remote-override-for-forked-repos-8203a311
    type: related-to
memoryVersion: 1
---
**One file per note:** Critical for git conflict isolation. Never aggregate notes into a single file.

**Embeddings gitignored:** Derived data, always recomputable. Committing them causes unresolvable merge conflicts (can't merge float arrays). `sync` auto-embeds notes that arrive from remote.

**Rebase on pull:** `git pull --rebase` keeps history linear. Don't switch to merge.

**Project ID from git remote URL, not local path:** `project.ts` normalizes remote URLs to stable slugs (e.g. `github-com-acme-myapp`). This makes cross-machine consistency work — local paths differ, remote URLs don't.

**Similarity boost, not hard filter:** `recall` gives project notes +0.15 cosine similarity boost rather than excluding global notes. Global memories (user prefs, cross-project patterns) remain accessible in project context.

**No auto-relationship via LLM:** Decided against using a local Qwen model to auto-build relationships. Small models lack session context, produce spurious edges, and corrupt the graph silently. Instead: agent instructions prompt `relate` immediately after `remember` while session context is warm.
