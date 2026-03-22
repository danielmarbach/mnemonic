---
title: Phase 1 Provenance + Confidence implementation design
tags:
  - architecture
  - design-decisions
  - provenance
  - phase-1
lifecycle: permanent
createdAt: '2026-03-22T11:45:34.639Z'
updatedAt: '2026-03-22T11:45:34.639Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
# Phase 1 Provenance + Confidence Design Decision

## What it does

Extends recall and orientation outputs with git-backed provenance metadata and confidence signals.

## Data Shapes

```typescript
type Provenance = {
  lastUpdatedAt: string;
  lastCommitHash: string;
  lastCommitMessage: string;
  recentlyChanged: boolean;  // daysSinceUpdate < 5
};

type Confidence = "high" | "medium" | "low";
```

## Confidence Heuristic

```text
if (lifecycle === "permanent" && centrality >= 5 && daysSinceUpdate < 30)
  → "high"
else if (daysSinceUpdate < 90)
  → "medium"
else
  → "low"
```

## Implementation Locations

1. **git.ts** - Added `getLastCommit(filePath)` and `getRecentCommits(filePath, limit)` read-only helpers
2. **structured-content.ts** - Added `Provenance`, `Confidence` types; extended `RecallResult`, `RecallResultSchema`, `OrientationNote`, `OrientationNoteSchema`
3. **index.ts** - Enrich recall results and orientation notes with provenance + confidence after scoring

## Key Principles

- Provenance is an **enrichment layer** - does NOT affect semantic scoring
- Git calls are read-only and scoped to top-N results only
- `recentlyChanged = daysSinceUpdate < 5` (5 days, not 3-7 - kept simple)
- Must be robust to: missing git repo, detached HEAD, empty history

## What NOT to do (Phase 1)

- No full history exploration
- No diff computation by default
- No probabilistic/ML-based confidence
- Keep it rule-based and predictable
