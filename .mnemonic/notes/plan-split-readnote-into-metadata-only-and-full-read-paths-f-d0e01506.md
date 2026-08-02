---
title: >-
  Plan: Split readNote into metadata-only and full-read paths for frontmatter
  streaming
tags:
  - workflow
  - request
  - performance
  - io
lifecycle: temporary
createdAt: '2026-08-02T07:44:06.550Z'
updatedAt: '2026-08-02T07:44:06.550Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
## Goal

Reduce I/O waste in bulk note listing operations by splitting `readNote` into a metadata-only path (reads only YAML frontmatter) and a full-read path.

## Problem

`listNotes()` reads entire markdown files just to extract frontmatter metadata. On the dogfood vault: 386.5KB total, only 60.1KB frontmatter — 84.5% waste. `collectVisibleNotes` (used by recall, list, project_memory_summary) only needs metadata (tags, project, title).

## Design: Option C — Clean split

### New methods in `src/storage.ts`

1. **`readNoteMetadata(id: MemoryId): Promise<Note | null>`** — Bounded frontmatter-only read:
   - Read first 16KB from file
   - Parse with gray-matter to extract frontmatter
   - If closing `---` not found in buffer, fall back to full read
   - Returns `Note` with `content: ""`
   - Reuses existing `parseNote` logic

2. **`listNotesMetadata(filter?)`** — Like `listNotes()` but uses `readNoteMetadata()`:
   - Same filtering logic (project)
   - Lighter I/O: only reads frontmatter
   - Returns `Note[]` with `content: ""`

### Changes by file

| File | Change | Lines |
| ------ | -------- | ------- |
| `src/storage.ts` | Add `readNoteMetadata()` method | ~20 |
| `src/storage.ts` | Add `listNotesMetadata()` method | ~15 |
| `src/cache.ts` | `getOrBuildVaultNoteList` → use `listNotesMetadata()` | ~3 |
| `src/cache.ts` | `getOrBuildVaultEmbeddings` → use `listNotesMetadata()` | ~3 |
| `src/tools/recall.ts` | `readCachedNote` → full `readNote()` when cache hit has empty content | ~10 |
| `src/tools/get.ts` | `get` → full `readNote()` when cache hit has empty content | ~10 |

### Unchanged

- `listNotes()` — keeps full content (used by `embedMissingNotes`, migrations)
- `readNote()` — unchanged full-file read
- `parseNote()` — unchanged
- `embedMissingNotes` — continues using `listNotes()` for full content

### Safety

- Frontmatter > 16KB → fallback to full read (correctness preserved)
- Malformed notes → same `MalformedNoteError`
- Missing notes → returns `null`
- Cache stores metadata-only; `get`/`recall` fall through to `readNote()` when content needed
