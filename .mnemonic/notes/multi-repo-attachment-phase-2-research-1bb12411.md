---
title: Multi-repo attachment — Phase 2 research
tags:
  - workflow
  - research
  - attachments
  - phase2
lifecycle: temporary
createdAt: '2026-05-23T12:19:42.386Z'
updatedAt: '2026-05-23T12:19:46.141Z'
role: research
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: multi-repository-attachment-support-request-root-151ad76c
    type: derives-from
memoryVersion: 1
---
# Multi-repo attachment — Phase 2 research

## Phase 1 status: COMPLETE (all code shipped)

All sub-phases 1a-1g implemented and committed. Phase 1 deliverables:

- Type migration (VaultProvenance, AttachmentRef, ProjectAttachmentConfig, writable)
- Config + VaultManager (projectAttachments, maxAttachmentsPerProject, schema migration 1.2)
- AttachedStorage (git-ref reads, session caching, NoteStorage interface)
- Vault routing (searchOrderMutable, allKnownVaultsMutable, findNote mutable, two-step lookup)
- 5 attachment tools (add/remove/list/set_enabled/set_branch) + sync integration
- Read path coverage (recall, list, get, memory_graph, recent_memories, project_memory_summary)
- Documentation (README, AGENT.md, CHANGELOG)

## Key gap: NO integration tests for attachment tools

Phase 1 shipped code without dedicated integration tests. The plan specified comprehensive test suites (attached-vault.integration.test.ts, AttachedStorage.unit.test.ts, recall pipeline tests, mutation error tests, output rendering tests) but none were created. Existing vault.unit.test.ts and vault-routing.integration.test.ts cover non-attachment vault routing only.

## Phase 2 scope analysis

The original request root scoped Phase 2 as "sync support, write support." However, Phase 1 already pulled sync support forward (explicit `sync` tool integration for attached vaults). So what remains?

### What the plan document says Phase 2 deferred

1. **Integration tests** — The entire test plan from Phase 1f/verification was never executed
2. **Staleness detection with embedding reconciliation** — `branchTipHash` comparison + cache invalidation + stale embedding cleanup on sync
3. **Auto-sync on branch change** — Explicitly deferred: "auto-sync on branch change for attached vaults (investigate after Phase 1)"
4. **Machine-specific localPath portability** — Known limitation; attachment configs use absolute paths
5. **Working-tree mode warnings** — `add_attachment` should warn when `branch: ""`

### What code analysis reveals still needs work

1. **No AttachedStorage unit tests** — git-ref reads, working-tree fallback, fail-soft, note caching, write methods that throw
2. **No attachment integration tests** — add/remove/list/set tools, recall/list/get with attached notes, scope filtering, mutation guards
3. **Recall scoring needs attachment boost** — Plan specifies `ATTACHMENT_BOOST = PROJECT_SCOPE_BOOST / 2 = 0.015` but current recall.ts uses projectScopeBoost only for matching project IDs
4. **collectVisibleNotes composite dedup** — Plan specifies `(noteId, vaultPath)` but current implementation uses `noteId` only (first-wins dedup)
5. **scope: "project" attachment-extended semantics** — Plan specifies attached notes pass scope: "project" filtering; need to verify implementation
6. **storedIn: "attached" support in tools** — Plan specifies new enum value; need to verify schema support

### Potential Phase 2 deliverables (prioritized)

**P0 — Must-have correctness:**

1. Integration test suite covering all attachment tools and read path behaviors
2. AttachedStorage unit tests (git-ref reads, caching, fail-soft)
3. Recall attachment boost implementation
4. collectVisibleNotes composite dedup + attachment-extended scope verification

**P1 — Important polish:**
5. Staleness detection with embedding reconciliation on sync
6. Mutation guard integration tests (specific error messages for attached note IDs)
7. Output rendering tests for `attached:` vault labels

**P2 — Deferred features:**
8. Auto-sync on branch change for attached vaults
9. Machine-specific localPath portability (shared config across machines)
10. Working-tree mode opt-in warnings in add_attachment

## Constraints

- No new I/O on cold paths
- Fail-soft to undefined
- Session cache reuse
- Explicit enablement, bounded counts
- Performance principles compliance
