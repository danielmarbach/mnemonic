---
title: 'verbose flag must not gate pipeline inputs, only output filtering'
tags:
  - design-principle
  - temporal
  - bug
  - decision
lifecycle: permanent
createdAt: '2026-03-28T22:11:33.811Z'
updatedAt: '2026-03-28T22:11:33.811Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
The `verbose` flag on `recall` must only control what is returned to the caller — it must not gate data that the internal classification pipeline depends on.

## The bug (0.19.1)

`buildTemporalHistoryEntry` conditionally included `stats` in its return value only when `verbose=true`. This meant `classifyChange` in `temporal-interpretation.ts` received entries without stats in non-verbose mode and fell back to `"unknown"` for every non-first commit. Consequence: `changeDescription` was always "Updated the note." and `historySummary` was always "This note has been updated several times." in the default (non-verbose) temporal mode.

## The fix (0.19.2)

Separate the two responsibilities:

1. `buildTemporalHistoryEntry` — always includes `stats` in the returned `TemporalHistoryEntry` (pipeline input, always needed for classification)
2. `src/index.ts` — strips `stats: undefined` from history entries in the output when `verbose=false` (output filter, controls what the caller sees)

```typescript
// After enrichTemporalHistory has run with full stats available:
history = verbose
  ? enriched.interpretedHistory
  : enriched.interpretedHistory.map(entry => ({ ...entry, stats: undefined }));
```

## Generalizable principle

When a flag controls output verbosity, apply it at the serialization boundary — never earlier in the pipeline where it would starve downstream logic of required inputs. The fix point is always: enrich fully, then filter at the output layer.

## How it was found

Interactive dogfooding run (B2 vs B3): the same note showed `"unknown"` / generic descriptions in non-verbose temporal mode but `"expand"` / descriptive output in verbose mode. The asymmetry pointed directly to stats being gated by verbose before classification.
