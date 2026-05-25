---
title: Multi-repository attachment support — request root
tags:
  - workflow
  - request
lifecycle: temporary
createdAt: '2026-05-22T18:43:54.599Z'
updatedAt: '2026-05-23T21:28:52.040Z'
role: context
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: multi-repo-federated-reads-codebase-research-626b102b
    type: derives-from
  - id: multi-repository-attachment-support-implementation-plan-b6423f79
    type: derives-from
  - id: multi-repo-attachment-phase-3-request-root-58d643a2
    type: follows
memoryVersion: 1
---
# Multi-repository attachment support

Add federated read-only project attachments so mnemonic can read from external repositories' `.mnemonic` vaults as knowledge sources for recall, summaries, and graph traversal.

## Scope

- Read-only knowledge source attachments to external repositories
- Configuration stored in main-vault config, per-project
- No automatic attachment — explicit add/remove tools
- Phase 1: read/query/orientation only (recall, summary, get, list, memory_graph, relationship previews)
- Phase 2 (deferred): sync support, write support

## Non-scope

- Not a second kind of writable project vault
- Not same-repo sub-vaults (already supported)
- Not automatic discovery
- Not cross-repo write operations

## Key constraints

- One note per file stays unchanged
- Embeddings remain derived, local-only
- No new I/O on cold paths
- Fail-soft to undefined
- Session cache reuse
- Explicit enablement, bounded attachment counts
