---
title: Document-source chunk embeddings use xxh128 for filenames and content hashes
tags:
  - document-source
  - embeddings
  - retrieval
  - attachments
lifecycle: permanent
createdAt: '2026-08-02T06:15:43.841Z'
updatedAt: '2026-08-02T06:16:01.222Z'
role: decision
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: chunk-embedding-path-layout-drop-redundant-guid-prefix-lower-6b739d42
    type: derives-from
memoryVersion: 1
---
Document-source chunk embedding cache files are now named by an **xxh128 digest** of the chunkId suffix, and the per-chunk **content hash is also xxh128**. Both sites had been slug-based / SHA-256 by accident; this makes one deliberate non-cryptographic hash the single source of truth. Reverses the "hash-based names judged overkill" residual in `chunk-embedding-path-layout-drop-redundant-guid-prefix-lower-6b739d42`.

## Why

The slug filename was unbounded: a chunkId is `<attachmentId>::<path>::<headings>::<dup>::<ordinal>`, and after slugifying the whole thing collapses into **one filename component**. Document-source markdown lives in arbitrarily deep paths with long heading ancestry, so that single component can blow past the 255-byte limit shared by APFS/ext4/NTFS (and NTFS caps total path at 260). This is unique to document sources — note-embedding filenames are short GUIDs. f87b0a6c's prefix-strip + lowercase reduced length but never bounded it.

The SHA-256 content hash (`document-sync.ts:169`) was an arbitrary default, never a deliberate choice. "It's already imported" is not a justification when the prior choice was itself accidental.

Retrieval is unaffected by either change: `collectDocumentChunkCandidates` keys on the in-memory `chunkEmbeddings` Map by the **chunkId stored in the JSON payload** — never the filename. As long as the filename is a deterministic function of the chunkId, slug, hash, or anything else works.

## Decisions

1. **Filename = `xxh128(chunkIdSuffix)`** (32 hex chars, fixed length → path-limit-safe regardless of source depth or heading ancestry). The `<attachmentId>::` prefix is still stripped before hashing, consistent with v3's per-attachment-directory scoping. `ChunkEmbeddingStorage` keeps its `(dir, attachmentId)` constructor.

2. **Content hash = `xxh128(projectionText)`**, replacing SHA-256. Unifies both sites under one deliberate non-cryptographic hash.

3. **128-bit, not 64-bit.** xxh64 was considered and rejected: at `maxTotalChunks: 50000` a 64-bit hash has birthday-collision probability ~7×10⁻¹¹. For filenames a collision silently clobbers one chunk's embedding (retrieval degrades to lexical-only for that chunk; reconcile cannot detect it). For content a collision causes a false cache-hit (wrong vector reused for a changed chunk). 128-bit removes both concerns entirely.

4. **xxh128 over SHA-256** because SHA-256's prior use was arbitrary and xxh128 is the purpose-built tool for content addressing at this scale. xxh128 over xxh64 for the collision-proofing above.

5. **Dependency: `xxhash-wasm`.** `node:crypto` has no xxhash (confirmed on Node 25.2.1). Hashing speed is not the bottleneck — the embed loop's per-chunk sequential `storage.read()` I/O dominates — but using the right tool is worth a tiny dep.

## Implementation consequences

- **`list()` must read files directly** instead of round-tripping the basename through `read()`/`pathFor()`. The slug was idempotent (`slug(slug(x)) === slug(x)`), so the old round-trip worked by coincidence; a hash is NOT idempotent (`hash(hash(x)) !== hash(x)`), so the round-trip would hash the hex filename again and miss the file. `read(chunkId)` (takes the real chunkId) and `reconcile()` (already reads directly) keep working unchanged. The fix mirrors `reconcile`'s direct-read approach.

- **`reconcile(removeNonCanonical)` stays.** It is NOT moot pre-ship: v2 slug-named files DID ship in 0.40.0, so upgrading users have v2 files to clean up. Whether v3 names them slug or xxh128, the v2→v3 migration needs the basename-mismatch cleanup. The re-embed is already forced by the filename change (`storage.read` computes the new path, file sits at the old v2 name → read misses → `existing` null → re-embed), so folding the contentHash switch into the same release costs nothing extra — users re-embed once, and the new xxh128 content hash is written during that same pass.

- **No separate `indexSchemaVersion` bump** for the contentHash change; it rides the existing v2→v3 bump from f87b0a6c.

## What changes

- `src/chunk-embedding-storage.ts`: `pathFor` uses `xxh128(suffix)`; `list()` reads files directly; contentHash comment updated (no longer "hex sha256").
- `src/document-sync.ts`: content hash at `:169` uses `xxh128`.
- New `xxhash-wasm` dependency + a small shared hash helper.
- Tests updated: filename assertion becomes the xxh128 digest; reconcile legacy-file test still valid (v2 slug names are the legacy).
