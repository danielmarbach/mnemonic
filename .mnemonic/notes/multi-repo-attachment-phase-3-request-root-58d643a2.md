---
title: Multi-repo attachment Phase 3 — request root
tags:
  - workflow
  - request
lifecycle: temporary
createdAt: '2026-05-23T21:28:46.530Z'
updatedAt: '2026-05-23T21:28:52.040Z'
role: context
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: multi-repository-attachment-support-request-root-151ad76c
    type: follows
memoryVersion: 1
---
# Multi-repo attachment Phase 3 — request root

Phase 3 of multi-repository attachment support. Four work streams:

## Scope

1. **Write-through to attached vaults** — remember/update/forget/relate/unrelate targeting attached vaults (write-through to external repos)
2. **Codebase-memory integration** — attached vault notes participate in codebase-memory-mcp knowledge graph for cross-repo structural queries (search_graph, trace_path, etc.)
3. **Complete Phase 2 residuals** — 3 unchecked items: recall-attachment E2E tests, tool-descriptions storedIn assertions, output-rendering integration tests
4. **Multi-repo relationship traversal** — relate/unrelate between local and attached vault notes, relationship previews across vault boundaries

## Prior work

- Phase 1: Complete — type migration, config, storage, routing, 5 attachment tools, read paths
- Phase 2: Mostly complete — tests, staleness, auto-sync, portability, docs (3 test items unchecked)

## Key constraints (inherited)

- One note per file unchanged
- Embeddings derived, local-only
- No new I/O on cold paths
- Fail-soft to undefined
- Session cache reuse
- Explicit enablement, bounded attachment counts
- Write methods on AttachedStorage: writeNote/deleteNote currently throw — need enabling for write-through
