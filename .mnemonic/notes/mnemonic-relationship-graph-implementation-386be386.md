---
title: mnemonic — relationship graph implementation
tags:
  - relationships
  - graph
  - feature
  - architecture
lifecycle: permanent
createdAt: '2026-03-07T17:59:57.597Z'
updatedAt: '2026-03-07T18:37:18.520Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mnemonic-mcp-tools-inventory-47499799
    type: related-to
memoryVersion: 1
---
Added typed relationship graph stored in note frontmatter.

**Storage:** `relatedTo` field in YAML frontmatter as array of `{id, type}` objects.

**Types:** `"related-to" | "explains" | "example-of" | "supersedes"`

**`storage.ts` changes:**

- Added `RelationshipType` union type and `Relationship` interface
- Added `relatedTo?: Relationship[]` to `Note`
- `writeNote` serializes when non-empty; `parseNote` reads it back

**`index.ts` changes:**

- `formatNote` shows `related: \`id\` (type), ...` line
- `forget` scans all notes after delete and strips dangling `relatedTo` references, commits affected files
- New `get` tool — fetch by exact id(s)
- New `relate` tool — bidirectional by default, skips if edge already exists
- New `unrelate` tool — removes edges in both directions

**Agent instruction:** call `relate` immediately after `remember` while session context is warm — don't defer, the advantage is gone next session.
