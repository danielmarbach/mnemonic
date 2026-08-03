---
title: >-
  Review: lazy document-generation loading needs concurrency and routing
  hardening
tags:
  - global-policy
  - document-source
  - storage
  - attachments
  - embeddings
  - review
  - design
lifecycle: permanent
createdAt: '2026-08-03T10:08:07.644Z'
updatedAt: '2026-08-03T10:08:13.894Z'
role: review
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: document-source-embeddings-for-global-policy-projects-main-v-ff2954f1
    type: follows
memoryVersion: 1
---
## Verdict

Decision 1 (main-vault fallback for global-policy projects) is sound and already works. Decision 2's core direction—persist a small derived-state manifest and lazily rebuild from the pinned local git commit without fetching—is sound, but the current plan is **not implementation-ready**. It needs concurrency, routing, compatibility, and failure-semantics changes before implementation.

## Must-fix design gaps

1. **Atomic construction and single-flight coordination.** `buildGenerationFromFiles()` currently publishes immediately, then `syncDocumentSource()` mutates the manifest and fills embeddings asynchronously. A recall can observe partial state. A cold lazy load can also publish an older manifest commit after a concurrent sync, regressing the current pointer. Refactor construction to return a complete unpublished generation; coordinate sync and load with a project+attachment keyed single-flight/mutex; publish once with compare-and-swap/epoch protection. Write manifests with temp-file + atomic rename only after reconciliation.

2. **Project-scoped generation routing and lifecycle eviction.** `generation-storage.ts` is keyed only by attachment ID. `get(doc:/chunk:)` does not verify that the attachment belongs to the resolved project or remains enabled. Removal/disable/replacement does not evict an in-memory generation. Key state by `{consumerProjectId, attachmentId}`, authorize enabled config before use, share the loader between recall and get, and add explicit eviction on remove, disable, and replacement.

3. **Dual cache-location resolution.** Storage can move from main fallback to project vault when `.mnemonic/` later appears. Recall must probe both locations deterministically or migrations will make previously synced manifests invisible. Centralize path resolution. A strong alternative is to make `~/mnemonic-vault/embeddings/doc-source/<projectId>/<attachmentId>/` canonical for all document-source derived state and dual-read old project paths during migration.

4. **Versioned, validated manifest.** The proposed fields are insufficient. Persist project/attachment binding, generation ID, indexed commit, normalized attachment-config hash (`localPath`/repo identity, root, include, exclude, accepted media types), separate extractor/chunker/projection/index identities, separate embedding compatibility identity, counts including embedded chunks, and build time. Validate the schema and full commit object ID and verify the object exists. Index incompatibility should require sync; embedding-only incompatibility should still allow lexical reconstruction while ignoring vectors.

5. **Capped embedding backfill.** `isGenerationCurrent()` returns unchanged for a compatible commit even if the first sync embedded only `maxEmbeddingWork` chunks. Therefore large sources can remain permanently partially embedded. Treat index currency and embedding completeness separately; unchanged syncs should load/reconcile and embed the next bounded batch. Repair a missing manifest on the unchanged path.

## Important refinements

- Replace sequential `git show` per file with `git cat-file --batch`/bounded blob reads; enforce file limits before blob hydration; benchmark at 1k/5k files before claiming 1–2 second cold-load latency.
- Bound embedding-file reads; avoid an unbounded `Promise.all` over up to 50k records.
- Fail soft per attachment but surface `local index unavailable; run sync` diagnostics instead of conflating failures with no matches.
- Test a true process restart, not only `clearAllGenerations()`: sync, stop MCP, restart with the same vault/config and embedding provider unavailable, then recall and direct get. Also cover both storage routes, route switching, concurrent recall/sync, corrupt manifest, missing commit, identity mismatch, capped backfill, disable/removal/replacement.

## Alternatives assessment

Rejected automatic network sync on recall and full-generation content duplication remain correctly rejected. The main missed alternatives are (a) one canonical main-vault cache location for all document-source derived state, and (b) a compact persisted retrieval index with lazy top-result hydration if cold rebuild benchmarks prove too slow. The latter should remain a measured fallback, not the initial implementation.
