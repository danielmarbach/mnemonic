---
title: 'Research: stream-json evaluation for mnemonic — wrong tool, right concept'
tags:
  - workflow
  - request
  - performance
  - io
  - research
lifecycle: temporary
createdAt: '2026-08-02T07:44:06.547Z'
updatedAt: '2026-08-02T07:44:06.547Z'
role: research
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
## Verdict

`stream-json` is NOT appropriate for mnemonic. However, the user correctly identified that `listNotes()` reads 84.5% unnecessary data (body content) when only frontmatter metadata is needed.

## Key findings

### Why `stream-json` doesn't fit

1. Data model mismatch: mnemonic uses one JSON file per record, not large JSON documents
2. Files are small (18-38KB each for embeddings, notes vary)
3. Notes are markdown+YAML frontmatter, not JSON — stream-json can't parse YAML
4. The bottleneck is I/O count (Promise.all over many files), not JSON parse speed

### The real waste

- Dogfood vault: 116 notes, 386.5KB total, 60.1KB frontmatter = **84.5% waste**
- `collectVisibleNotes` (used by recall, list, project_memory_summary) only filters by tags, project, title — all frontmatter fields
- Largest single waste: 14.8KB in one note

### Correct approach

Not `stream-json` but bounded frontmatter reads: read first 16KB, parse frontmatter, stop. Falls back to full read if frontmatter exceeds buffer. Implements as `readNoteMetadata()` separate from `readNote()`.
