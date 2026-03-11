---
title: 'execute-merge scope bug: projectNotes filter excludes cross-scope sources'
tags:
  - bug
  - consolidate
  - execute-merge
  - scope
  - fix
  - design
lifecycle: permanent
createdAt: '2026-03-11T11:07:07.938Z'
updatedAt: '2026-03-11T11:07:16.639Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mnemonic-consolidate-tool-design-b9cbac6a
    type: explains
memoryVersion: 1
---
# execute-merge scope bug: projectNotes filter excludes cross-scope sources

## What broke

`consolidate` with `strategy: "execute-merge"` passed `projectNotes` (scope-filtered) to `executeMerge`, not the full `entries` list. This meant:

- With `cwd`: only project-associated notes were searchable — purely global notes (no `.project` field) were silently not found.
- Without `cwd`: only global notes were searchable — project-associated notes in main-vault were silently not found.

The result was a "Source note not found" warning and a no-op merge whenever `sourceIds` spanned both a global note and a project-associated note, even when both physically lived in main-vault.

## Root cause (index.ts)

```typescript
// Before fix — executeMerge only sees one scope
const projectNotes = project
  ? entries.filter((e) => e.note.project === project.id)
  : entries.filter((e) => !e.note.project);

return executeMerge(projectNotes, mergePlan, ...);
```

The filter is correct for discovery strategies (suggest-merges, detect-duplicates, find-clusters) where scoped analysis is intentional. But `execute-merge` with explicit `sourceIds` should never be scope-restricted — the caller has named every source explicitly.

## Fix

```typescript
// After fix — executeMerge receives the full vault scan
return executeMerge(entries, mergePlan, ...);
```

One-line change. All other strategies still receive `projectNotes`.

## Design principle to preserve

**Discovery strategies** (suggest-merges, detect-duplicates, find-clusters, dry-run, prune-superseded) operate on a scoped note set — this is intentional, they only analyse notes relevant to the current project or global context.

**execute-merge** with explicit `sourceIds` must operate on the full entry set. The caller owns the scope decision; the tool must not second-guess it by filtering.

## Test added

`tests/mcp.integration.test.ts`: "merges a global note and a project-associated note in a single execute-merge call" — creates one purely global note and one project-associated-but-main-vault note, merges both without `cwd`, verifies no "not found" warning and both sources are deleted.
