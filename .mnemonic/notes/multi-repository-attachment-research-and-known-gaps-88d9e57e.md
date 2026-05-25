---
title: Multi-repository attachment research and known gaps
tags:
  - workflow
  - research
  - attachments
  - known-gaps
lifecycle: permanent
createdAt: '2026-05-25T17:24:09.244Z'
updatedAt: '2026-05-25T17:24:09.244Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: multi-repository-attachment-support-request-root-151ad76c
    type: derives-from
  - id: multi-repo-attachment-phase-3-request-root-58d643a2
    type: derives-from
  - id: multi-repo-federated-reads-codebase-research-626b102b
    type: derives-from
  - id: multi-repository-attachment-plan-critical-review-795b9192
    type: derives-from
  - id: apply-multi-repo-attachment-phase-2-integration-tests-and-p0-f16c0bf8
    type: follows
memoryVersion: 1
---
Consolidate multi-repository attachment research, review evidence, design decisions, implementation status, and known gaps into one canonical note.

# Multi-repository attachment research and known gaps

Consolidated research, implementation status, review evidence, and known gaps for multi-repository attachment support in mnemonic.

## Current Status

Multi-repository attachment support lets a project explicitly attach external repositories' `.mnemonic` vaults as knowledge sources. Attached vault notes participate in recall, summaries, list/get, memory graph traversal, and relationship previews.

The implementation evolved across three phases:

- Phase 1 delivered the attachment data model, config, storage, routing, management tools, read paths, sync integration, and documentation.
- Phase 2 delivered verification, staleness handling, attachment boost, output labels, path portability, auto-sync on branch changes, and broader tests.
- Phase 3 expanded the design toward writable attached vaults and cross-vault relationships, with several review gaps still worth tracking.

## Design Decisions

- `Vault` uses discriminated `provenance` instead of the old `isProject` boolean.
- Attached vault labels use `attached:<project-slug>/.mnemonic`.
- Attachment configs are explicit and bounded by `maxAttachmentsPerProject`.
- Attachment paths may be stored with `~` via `collapseHomePath` and expanded at runtime.
- Attached notes are project-extended for scope purposes: `scope: "project"` includes them, `scope: "global"` excludes them.
- `storedIn: "project-vault"` excludes attached vaults; `storedIn: "attached"` selects only attached vaults; `storedIn: "any"` includes all visible vaults.
- Recall applies an attachment boost of `0.015`, half of the project-scope boost.
- Deduplication must use `(noteId, vaultPath)`, not only `noteId`, because different vaults may contain notes with the same id.
- Embeddings for attached vaults are derived and local to the consuming project under `.mnemonic/attachments/<slug>/`.
- Read failures for attached vaults fail soft: skip the attachment and continue.

## Implemented Capabilities

- Attachment management tools: `add_attachment`, `remove_attachment`, `list_attachments`, `set_attachment_enabled`, and `set_attachment_branch`.
- Attached storage supports git-ref reads, working-tree fallback, fail-soft behavior, and local embedding/projection writes.
- Read paths include attached notes for recall, list, get, recent memories, summaries, memory graph, and relationship previews.
- Sync support includes attachment sync and cache invalidation.
- Staleness detection compares stored `branchTipHash` with the current git tip.
- Auto-sync on consuming project branch changes was implemented.
- Output schemas and rendering understand `attached:` vault labels.
- Tooling and docs were updated in AGENT.md, README.md, and CHANGELOG.md.

## Verification Evidence

- Phase 1 type migration passed 926 tests.
- Phase 2 verification reported 1063 to 1064 passing tests, with fixture-dependent skips and one flaky pre-existing timeout.
- Later Phase 2 planning recorded coverage for attached storage unit tests, config tests, vault helper tests, staleness/embedding reconciliation tests, output schema tests, and vault routing assertions.
- Phase 2 review found all checked constraints passing and no mutation path writing to attached vault notes.
- Phase 3 review reported TypeScript passing and `npm test` at 1092 passed, 6 skipped, 3 failed at that time.
- A later branch-protection review for attached vault mutations reported 1126/1126 tests passing.

## Known Gaps

### Writable attached vault cache invalidation

Writable attached vault mutations must invalidate both session-level caches and `AttachedStorage`'s internal `noteCache`/`noteIdCache`. A prior review found session cache invalidation existed, but storage-level cache invalidation was missing or needed verification.

### branchTipHash after write-push

After write-through mutation and push, `attachmentRef.branchTipHash` should be updated. Without this, later loads may detect false staleness and reload unnecessarily.

### Writable getter duplication

Writable behavior was implemented in more than one place, including attachment config handling and vault creation. This is a maintenance risk even if it is not a live behavior bug.

### Writable attachment error messages

`attachedVaultErrorMessage` previously described attached vaults as read-only unconditionally. It should distinguish non-writable attachments from explicitly writable attachments.

### Tool descriptions for writable attachments

Mutation tool descriptions should clearly explain how writable attachments behave and when non-writable attached vaults reject mutations.

### Cross-vault relationship cleanup

Forgetting a note should clean dangling relationship references best-effort across all visible writable vaults. References in non-writable attached vaults may need to be reported rather than mutated.

### Cross-vault relationship previews and graph traversal

Relationship previews, recall expansion, and memory graph traversal should consistently resolve vault-qualified relationships across local, project, sub-vault, and attached vault boundaries.

### Residual integration tests

The historical residuals were:

- Recall attachment E2E tests that depended on persistent MCP session behavior.
- Tool-description assertions for `storedIn: "attached"`.
- Output-rendering integration tests for `attached:` labels.
- Mutation-error tests for non-writable attached vaults.
- Writable attached vault mutation tests for remember, update, forget, and relate.
- Cross-vault relate/unrelate integration tests.

Some of these may have been completed later; verify current test files before treating this list as live work.

## Constraints To Preserve

- One note per file remains unchanged.
- Embeddings remain derived and local-only.
- No new I/O on cold paths.
- Fail soft when attached repositories, refs, or git commands are unavailable.
- Reuse caches and invalidate only on sync, branch change, staleness, or mutation.
- Attachments remain explicitly configured and bounded.
- Writable attachments require explicit opt-in.
- Branch protection must be checked before mutating attached vaults.
- Git commits for attached vault mutations must be scoped to the attached vault's mnemonic notes paths.

## Current Interpretation

This note is the canonical research and gap tracker for multi-repository attachment support. Use it before planning new attachment work, validating write-through behavior, or deciding whether older phase-specific attachment notes can be pruned.
