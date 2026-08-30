---
title: >-
  Bug: bidirectional relate duplicates directional relationship types (mutual
  supersedes)
tags:
  - bug
  - relate
  - relationships
  - supersedes
  - prune
  - consolidate
lifecycle: permanent
createdAt: '2026-08-30T11:21:15.725Z'
updatedAt: '2026-08-30T11:21:20.538Z'
role: review
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: consolidate-tool-design-execute-merge-behavior-idempotency-a-0911e2cd
    type: related-to
  - id: flatten-doc-source-embeddings-path-drop-redundant-projectid--c8c5824f
    type: related-to
memoryVersion: 1
---
## Problem

`relate` with `bidirectional: true` (the default) writes the **same relationship type on both notes**:

```typescript
// src/tools/relate.ts — registerRelateTool
const toRelationship: Relationship = { id: memoryId(fromId), type }; // backlink keeps the requested type
```

For the symmetric `related-to` type this is correct. For directional types (`supersedes`, `derives-from`, `follows`, `example-of`, `explains`) the backlink inverts the semantics: each note ends up carrying the relationship in its own direction. For `supersedes` this creates a **mutual pair** where each note claims to supersede the other.

## Consequence: prune can delete canonical notes

`prune-superseded` deletes every note whose `relatedTo` carries a `type: supersedes` entry (`pruneSuperseded` in `src/tools/consolidate-helpers.ts`). It has no direction or cycle detection, so a mutual pair means **both notes are deleted — including the canonical survivor**. Silent knowledge loss in the vault.

There is also a latent direction inconsistency between two conventions reading the same frontmatter shape `{ id, type: supersedes }`:

- `execute-merge` (supersedes mode) and `prune-superseded`: **carrier = superseded source**, referenced id = canonical target
- `relate` and `buildSupersededByMap` (evidence): **carrier supersedes** the referenced id

Both write/read the identical frontmatter shape with opposite meanings.

## Real-world occurrence (vault prune on 2026-08-30)

Commit `057fc2b` ("relate: Flatten doc-source embeddings path ... ↔ Document-source embeddings for global-policy projects") recorded `flatten-doc-source-embeddings-path... supersedes document-source-embeddings-for-global-policy...` and wrote `type: supersedes` on **both** notes. An unmodified `consolidate prune-superseded` would have deleted the canonical `flatten-doc-source-embeddings-path-drop-redundant-projectid--c8c5824f` decision note together with its superseded source.

Repair applied before pruning:

1. `unrelate` (bidirectional) removed both supersedes links
2. The pair was re-linked as `related-to` — flatten only reverses Decision 1's projectId path segment and does not supersede the lazy-generation-loading decision, so neither note truly supersedes the other
3. `prune-superseded` then deleted only the three intended execute-merge sources (`decision-phase-2-recall-scoring-uses-rrf...`, `hybrid-recall-design-and-implementation...`, `multi-channel-ranking-fusion-principles`) superseded by `canonical-design-bounded-rrf-hybrid-recall-172a96ab`

## Fix suggestions

1. `relate`: for directional types, skip the backlink entirely or write a proper inverse type; making the backlink opt-in per type is another option
2. `prune-superseded`: detect mutual supersedes (A→B and B→A) and refuse or warn instead of deleting both
3. Optionally guard `relate` from creating a supersedes link when the reverse direction already exists
