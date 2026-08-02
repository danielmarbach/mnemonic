---
title: 'Implemented: NoteMetadata/Note type hierarchy replacing content sentinel'
tags:
  - performance
  - io
  - types
  - completed
lifecycle: permanent
createdAt: '2026-08-02T08:40:21.855Z'
updatedAt: '2026-08-02T08:40:21.855Z'
role: context
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
## What changed

Replaced the `content: ""` sentinel pattern with explicit TypeScript types:

```typescript
interface NoteMetadata { /* all frontmatter fields, no content */ }
interface Note extends NoteMetadata { content: string }
```

### Key artifacts

- `hasNoteContent(note: NoteMetadata): note is Note` — type predicate used in 10 files
- `toNoteMetadata()` — runtime stripping of content field
- `readFrontmatter()` — bounded 16KB read for metadata-only extraction (84.5% I/O savings)
- `readNoteMetadata()` / `listNotesMetadata()` — new metadata-only paths
- Session cache stores `NoteMetadata[]` — bulk operations don't read note bodies

### Files changed (12 production + 2 test)

- `src/storage.ts` — NoteMetadata type, hasNoteContent, toNoteMetadata, readFrontmatter
- `src/attached-storage.ts` — metadata-only read/list implementations
- `src/cache.ts` — VaultCache stores NoteMetadata
- `src/helpers/vault.ts` — NoteEntry uses NoteMetadata, vault.ts formatting guarded
- `src/tools/get.ts` — hasNoteContent guard
- `src/tools/recall.ts` — hasNoteContent guard  
- `src/tools/recall-helpers.ts` — hasNoteContent guard
- `src/tools/project-memory-summary.ts` — hydration loop + HydratedNoteEntry
- `src/tools/recent-memories.ts` — hasNoteContent guard
- `src/tools/discover-tags.ts` — hasNoteContent guard
- `src/tools/consolidate-helpers.ts` — hasNoteContent guard
- `src/role-suggestions.ts` — NoteMetadata parameter
- `src/projections.ts` — isProjectionStale accepts NoteMetadata
- `src/auto-relate.ts` — NoteMetadata parameter
- `tests/storage.unit.test.ts` — 7 new tests
- `tests/cache.unit.test.ts` — updated mocks

### Validation

- 1387 tests pass
- npm run build (tsc --noEmit + tsc) passes
- No remaining content sentinel in production code
- Compiler prevents accidental .content access on NoteMetadata
