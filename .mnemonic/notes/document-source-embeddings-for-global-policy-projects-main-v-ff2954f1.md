---
title: >-
  Document-source embeddings for global-policy projects: main-vault fallback and
  lazy generation loading
tags:
  - attachments
  - document-source
  - embeddings
  - storage
  - global-policy
  - design
  - decision
lifecycle: permanent
createdAt: '2026-08-03T09:57:33.038Z'
updatedAt: '2026-08-30T11:19:37.525Z'
role: decision
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: vault-creation-audit-which-tools-can-create-mnemonic-and-whi-d0388691
    type: related-to
  - id: review-lazy-document-generation-loading-needs-concurrency-an-b49cd0cd
    type: follows
  - id: flatten-doc-source-embeddings-path-drop-redundant-projectid--c8c5824f
    type: related-to
memoryVersion: 1
---
# Document-source embeddings for global-policy projects: main-vault fallback and lazy generation loading

## Problem

Document-source chunk embeddings were stored under `.mnemonic/embeddings/doc-source/<attachmentId>/`, requiring the project vault (`.mnemonic/`) to exist. Projects with global storage policy never create `.mnemonic/` — `getOrCreateProjectVault` is only called from `remember` (scope: project) and `move_memory`. The unadopted-project principle (`vault-creation-audit-which-tools-can-create-mnemonic-and-whi-d0388691`) intentionally prevents silent `.mnemonic/` creation.

Result: for global-policy projects, `syncDocumentSource` received `projectEmbeddingsDir = undefined` (from `getProjectVaultIfExists` returning null), so the embedding block was skipped entirely. Document sources were limited to lexical-only retrieval — the fail-soft fallback the spec described, not the intended primary path (`document-source-chunk-embeddings-specified-but-never-deliver-6e867617`).

A second problem compounded the first: `DocumentGeneration` is in-memory only (module-level `Map` in `generation-storage.ts`). After every MCP server restart, generations vanish and recall returns no document chunks until the user manually runs `sync` to rebuild them.

## Decision 1: Main-vault fallback for chunk embeddings (implemented, committed 034f6c8)

When the project vault doesn't exist, store document-source chunk embeddings in the main vault, namespaced by project ID:

```text
~/mnemonic-vault/embeddings/doc-source/<projectId>/<attachmentId>/
```

The `syncDocumentSource` parameter was renamed `projectEmbeddingsDir` → `docSourceBase` to clarify it's the full doc-source embeddings base directory (including the `doc-source` segment and optional project-ID namespacing), not the raw vault embeddings directory. The caller (`sync.ts`) constructs the path:

- Project vault exists: `path.join(projectVault.storage.embeddingsDir, "doc-source")`
- Project vault missing: `path.join(mainVault.storage.embeddingsDir, "doc-source", project.id)`

`remove-attachment` tries both locations (project vault + main vault fallback) for cleanup — `fs.rm` with `force: true` is a no-op for non-existent paths, so this also handles the edge case where storage policy changed between when embeddings were stored and when the attachment is removed.

### Alternatives considered for Decision 1

1. **Create a minimal `.mnemonic/embeddings/` without full vault** — rejected because `.mnemonic/` existence is the adoption signal for `resolveWriteScope()`. Creating it would cause `remember` to default to "project" instead of "ask", violating the unadopted-project principle.
2. **Separate per-project embeddings cache** (e.g., `~/mnemonic-vault/embeddings/projects/<projectId>/doc-source/<attachmentId>/`) — rejected as more complex than necessary; the simpler namespacing by project ID directly under `doc-source/` achieves the same isolation.
3. **Make sync create the project vault on-demand for document sources** — rejected for the same reason as alternative 1.

### Tradeoffs

- Main vault grows with document-source embeddings (gitignored, re-computable — same as note embeddings)
- Embeddings not co-located with the project (acceptable: embeddings are derived state, never committed)
- Need namespacing by project ID to avoid collisions between projects (handled by the path construction)

## Decision 2: Lazy generation loading via persisted manifest (not yet implemented)

The ephemeral generation issue (`DocumentGeneration` is in-memory only, lost on restart) was analyzed extensively. Multiple approaches were considered and rejected before arriving at the chosen design.

### Alternatives considered for Decision 2

1. **`autoSync` as a per-project setting, triggering full `sync` on recall** — rejected for two reasons:
   - **Naming inconsistency**: `sync` is a generic capability covering vaults, mnemonic-vault attachments, and document sources. An `autoSync` setting that only covers document sources is confusing — users would expect it to sync everything.
   - **Not really sync**: If `autoSync` only rebuilds the in-memory generation from the last known commit (no `git fetch`, no network), it's not "sync" — it's just loading data that should have been persisted. Calling it "sync" misrepresents what it does.

2. **`autoSync` as a general setting triggering full `sync` (including git fetch) on recall** — rejected because:
   - Network I/O on recall could add seconds of latency
   - Requires timeout handling to prevent recall from blocking indefinitely
   - Users opted into document sources, not into network I/O on every recall

3. **Persist the full `DocumentGeneration` to disk** (e.g., `generation.json` containing chunks, documents, content) — rejected because it would duplicate all markdown content locally. The source files already exist in the git repo. Copying them into a generation file defeats the purpose of document sources being a lightweight, non-copying retrieval layer.

4. **Require manual `sync` after every restart** (status quo) — rejected as poor UX. Users expect recall to work without manual intervention, especially after the main-vault fallback makes embeddings available for global-policy projects.

### Chosen approach: Persist a tiny manifest, rebuild from git on demand

At the end of a successful `syncDocumentSource`, write a small manifest file alongside the chunk embeddings:

```text
<embeddingsDir>/doc-source/<attachmentId>/manifest.json
```

Contents: `indexedCommit`, `indexSchemaVersion`, `embeddingCompatibilityIdentity`, `documentCount`, `chunkCount`. A few hundred bytes — not content.

On recall, when `getCurrentGeneration(attachmentId)` returns null:

1. Read the manifest from disk (one tiny file)
2. Rebuild the generation from git at the known commit — `git ls-tree` + `git show` per file (local only, no network)
3. Load chunk embeddings from existing disk files (content-hash reuse, no re-embedding)
4. Assemble and publish the in-memory `DocumentGeneration`
5. Proceed with recall

If no manifest exists (never synced, or cleaned up): skip — no chunks for that attachment. User runs `sync` first.

### Why this works

- **No content duplication**: content stays in the git repo. The manifest is a bookmark, not a copy.
- **No network I/O**: we read from the local git repo at the known commit. No `git fetch`.
- **No new user-facing setting**: no `autoSync` in `ProjectMemoryPolicy`, no naming problem. It's just lazy loading from the source on first access — the same pattern as loading notes from `.md` files.
- **No timeout concern**: the operation is bounded local I/O. For a moderate repo (~100 files), ~200ms-500ms. For a large repo (~1000 files), ~1-2s. Once per session; subsequent recalls are O(1).
- **Existing cleanup covers it**: `remove-attachment` already `fs.rm`s the entire `<attachmentId>/` directory — the manifest lives there.
- **Manual sync still needed for new commits**: lazy loading rebuilds at the last known commit, not HEAD. Staying up-to-date with remote requires manual `sync` (which does `git fetch`). This is acceptable — the problem was the ephemeral generation, not stale content.

### Relationship to the plan note

The plan note (`plan-deliver-document-source-chunk-semantic-retrieval-embedd-dba90b71`) explicitly chose "DocumentGeneration stays in-memory; chunk embeddings persist to disk separately." This decision didn't account for the restart scenario. The manifest approach doesn't violate that decision — the generation is still in-memory for the session, and the chunks are still rebuilt from the git repo (not persisted as a copy). The manifest is just enough persisted state to know *which commit* to rebuild from, not the generation itself.

## Implementation status

- Decision 1 (main-vault fallback): implemented and committed (034f6c8). Tests pass (1415 tests, typecheck, lint clean).
- Decision 2 (lazy generation loading): not yet implemented. Design agreed. Implementation requires:
  1. Write manifest file at end of `syncDocumentSource`
  2. Loader function: read manifest + rebuild generation from git + load embeddings from disk
  3. `recall.ts`: call loader when `getCurrentGeneration()` returns null
  4. Tests: verify recall works after simulated restart (clear in-memory generations, recall, verify chunks returned)
