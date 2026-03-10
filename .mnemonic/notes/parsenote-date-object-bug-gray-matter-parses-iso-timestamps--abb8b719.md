---
title: 'parseNote Date object bug: gray-matter parses ISO timestamps as Date instances'
tags:
  - bug
  - storage
  - gray-matter
  - parsing
  - fixed
lifecycle: permanent
createdAt: '2026-03-10T19:48:39.017Z'
updatedAt: '2026-03-10T19:58:07.203Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: embedding-lazy-backfill-and-staleness-detection-implementati-235207a1
    type: supersedes
  - id: embedding-lazy-backfill-and-staleness-detection-implementati-b3415cb2
    type: supersedes
  - id: embedding-lazy-backfill-and-staleness-detection-implementati-a416e3f7
    type: supersedes
  - id: embedding-lazy-backfill-and-staleness-detection-implementati-eb820222
    type: supersedes
memoryVersion: 1
---
## Bug

When gray-matter parses YAML frontmatter, unquoted ISO date strings (e.g. `2026-01-01T00:00:00.000Z`) are parsed as JavaScript `Date` objects, not strings. Notes written through mnemonic tools are safe (they always use `new Date().toISOString()`). Notes arriving via `git pull` from another machine are affected.

## Fix

Added `toIsoString()` helper in `src/storage.ts` `parseNote()`:

```typescript
function toIsoString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value) return value;
  return new Date().toISOString();
}
```

Used for both `createdAt` and `updatedAt` fields.

## Discovery

Found during testing of lazy backfill feature: hand-crafted test notes (simulating git pull) triggered output validation error `received date, expected string` in the recall structured content schema.
