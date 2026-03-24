---
title: 'Consolidate tool: design, execute-merge behavior, idempotency, and scope fix'
tags:
  - consolidate
  - design
  - architecture
  - decision
lifecycle: permanent
createdAt: '2026-03-24T10:54:19.723Z'
updatedAt: '2026-03-24T10:54:19.723Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mnemonic-key-design-decisions-3f2a6273
    type: related-to
  - id: mnemonic-mcp-tools-inventory-47499799
    type: explains
  - id: agent-instruction-improvements-session-start-recall-first-an-ecd402c3
    type: example-of
memoryVersion: 1
---
## Tool design

`consolidate` merges overlapping memories into a canonical note and retires the sources.

**Strategies:**
- `detect-duplicates` — find semantically similar notes (>0.85 similarity)
- `find-clusters` — group notes by theme and relationship density
- `suggest-merges` — actionable merge recommendations with rationale
- `execute-merge` — perform consolidation (requires `mergePlan`)
- `prune-superseded` — delete notes marked as superseded, keep only latest
- `dry-run` — preview all strategies without changes

**Consolidation modes:**
- `supersedes` (default) — keep sources with `supersedes` relationship; prune later via `prune-superseded`
- `delete` — hard-delete sources via `forget`; immediate, irreversible

**Cross-vault behavior:** gather all notes with matching project ID from both vaults, consolidate into project vault, apply mode to all sources regardless of original vault.

**Project policy:** `consolidationMode` stored in `config.json` defaults to `supersedes`.

## Custom content body override

`mergePlan.content` (optional) replaces the auto-merged source content verbatim dump.

- `content` present: body = optional description + custom content (no `## Consolidated from:` block)
- `content` absent: description + `## Consolidated from:` block with all source content

Use `content` when consolidating temporary notes whose sources contain working-state content (plans, WIP checklists) that should not persist in the permanent note.

## Idempotency via pre-flight duplicate detection

`executeMerge()` intersects the `supersedes` targets referenced by all source notes before creating a new target. It reuses a candidate when the title matches exactly and the candidate ID shares the target title slug prefix.

On reuse: existing target note is updated in place, `createdAt` preserved, source relationships deduplicated, result text makes idempotent reuse explicit.

This makes retries safe for LLMs and thin MCP clients that lose retry state.

## Scope fix: execute-merge receives the full entry set

**Bug:** `execute-merge` was passed `projectNotes` (scope-filtered) instead of the full `entries` list. Cross-scope `sourceIds` (a global note + a project note) caused silent "Source note not found" and no-op merges.

**Root cause:** The `projectNotes` filter is correct for discovery strategies (suggest-merges, detect-duplicates, find-clusters) where scoped analysis is intentional. But `execute-merge` with explicit `sourceIds` must never be scope-restricted — the caller owns the scope decision.

**Fix:** pass `entries` (full vault scan) to `executeMerge()`. One-line change. All other strategies still receive `projectNotes`.

**Design principle to preserve:** discovery strategies operate on a scoped set; `execute-merge` with explicit `sourceIds` operates on the full set.
