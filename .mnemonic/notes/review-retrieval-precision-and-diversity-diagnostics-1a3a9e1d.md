---
title: 'Review: Retrieval precision and diversity diagnostics'
tags:
  - workflow
  - review
  - recall
  - diagnostics
  - cag-bench
lifecycle: temporary
createdAt: '2026-05-09T11:55:51.123Z'
updatedAt: '2026-05-09T11:57:42.942Z'
role: review
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: apply-retrieval-precision-and-diversity-diagnostics-1a7e78c0
    type: derives-from
memoryVersion: 1
---
## Review: Retrieval Precision and Diversity Diagnostics

### Plan deliverables check

- [x] Step 1: `recallScopeNoteCount` in RecallResult schema — shipped, optional number on both interface and Zod
- [x] Step 2: Vault-size-aware default limit — gated on `limit >= ctx.defaultRecallLimit`, single threshold (<=25 dump all), session-cache derived
- [x] Step 3: Diversity metrics — themeCount (unique tags), roleMix, lifecycleMix with proper types
- [x] Step 4: retrievalCoverage — anchorsInResults, fraction, missingAnchors with titles, superseded exclusion, project-scoped only

### Type safety verification

- RoleMix/lifecycleMix use `Partial<Record<NoteRole, number>>` not `Record<string, number>` — invalid states unrepresentable
- Zod v4 compatibility: `z.record(z.string(), z.number())` (`.partial()` not supported in v4)
- All new fields optional for backward compatibility

### Performance principles verification

- Anchor identification reuses session cache (`getOrBuildVaultNoteList`), no new I/O
- Limit heuristic reads from already-populated cache, falls back to default on miss
- No git calls added, no full-vault scans on mutation paths

### Fail-soft verification

- Anchor identification: `continue` on vault failure (skip vault, not silent empty Set)
- Diversity computation: wrapped in try/catch, returns undefined
- Coverage computation: wrapped in try/catch, returns undefined
- Limit heuristic: wrapped in try/catch, falls back to configured limit
- Coverage skipped entirely when no project context

### Research requirements met

- Gap 3 (scale-adaptive retrieval): limit expansion for small vaults, recallScopeNoteCount for agents
- Gap 4 (token efficiency metrics): recallScopeNoteCount exposed for agent-side computation
- Gap 2 (retrieval precision approximation): diversity + coverage metrics as proximal measures

### Test verification

- Command: `npx tsc --noEmit`
- Result: pass
- Details: zero errors

- Command: `npm test`
- Result: pass
- Details: 50 files, 845 tests, all passing

### Recommendation

Continue. All plan deliverables shipped, all constraints preserved, all tests passing. Ready for you to decide on commit.
