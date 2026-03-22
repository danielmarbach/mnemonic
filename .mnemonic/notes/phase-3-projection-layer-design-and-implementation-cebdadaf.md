---
title: Phase 3 projection layer design and implementation
tags:
  - design
  - embeddings
  - projections
  - architecture
lifecycle: permanent
createdAt: '2026-03-22T21:31:41.688Z'
updatedAt: '2026-03-22T21:31:41.688Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Projections are compact, deterministic, derived representations of notes used as embedding input instead of raw title+content.

## Problem

Raw title+content embedding input includes all prose, code blocks, and noisy markdown. A compact structured representation improves embedding quality and enables faster summary/orientation without changing note storage.

## Design decisions

**Source of truth unchanged** — full markdown note remains authoritative. Projections are derived, local-only, gitignored artifacts stored in vaultPath/projections/ as JSON.

**Projection schema** in src/structured-content.ts:

- projectionText: compact embedding input (max 1200 chars): Title / Lifecycle / Tags / Summary / Headings
- summary: extracted from first non-heading paragraph → first bullet list → first 200 chars of body
- headings: h1–h3 only, plain text, deduplicated, max 8, order-preserved
- updatedAt: staleness anchor (matches note.updatedAt)
- generatedAt: timestamp of derivation run

**Staleness via updatedAt only** — no hashing. isProjectionStale = projection.updatedAt !== note.updatedAt. MCP always updates updatedAt on mutation, so this is a reliable single-source-of-truth check.

**Lazy build** — getOrBuildProjection builds on demand and saves with best-effort (never throws). No global rebuild required.

**Fallback chain** — if projection build fails, embed falls back to title+content. Never blocks user-facing operations.

**Storage** — Storage class gains projectionsDir, projectionPath(id), writeProjection(), readProjection(). init() creates the directory. ensureGitignore now adds both embeddings/ and projections/.

**Embedding integration** — new embedTextForNote(storage, note) helper wraps getOrBuildProjection with fallback. Used in remember, update, embedMissingNotes, and consolidate.

**Summary integration** — project_memory_summary related-global previews use projection.summary when available, falling back to summarizePreview(content).

## Explicitly not done

- No global rebuild CLI command (lazy-only per requirements)
- No change to ranking logic or note storage format
- No new user-facing mandatory metadata
- No database or background service
- No LLM summarization for projections
