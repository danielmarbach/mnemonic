---
title: >-
  Enrichment layer design: provenance, temporal recall, projections, and
  relationship expansion
tags:
  - architecture
  - design
  - decision
  - provenance
  - temporal
  - embeddings
  - relationship-expansion
lifecycle: permanent
createdAt: '2026-03-24T10:54:54.335Z'
updatedAt: '2026-04-04T11:51:46.378Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mnemonic-key-design-decisions-3f2a6273
    type: related-to
  - id: active-session-project-cache-single-in-memory-vault-cache-pe-7463f124
    type: related-to
  - id: mnemonic-role-suggestions-are-read-only-runtime-hints-d9e468cf
    type: explains
  - id: mnemonic-roles-are-hints-not-schema-b45478c7
    type: related-to
  - id: phase-1-design-hybrid-recall-over-existing-projections-4dc7dbb9
    type: related-to
memoryVersion: 1
---
Four post-processing enrichment layers added on top of semantic recall. Each is additive: core recall ranking is unaffected, failures fail-soft.

## Phase 1 — Provenance + Confidence

Every `recall` and `project_memory_summary` result includes git-backed metadata:

```typescript
type Provenance = {
  lastUpdatedAt: string;
  lastCommitHash: string;
  lastCommitMessage: string;
  recentlyChanged: boolean;  // daysSinceUpdate < 5
};
type Confidence = "high" | "medium" | "low";
```

Confidence heuristic:
```
if (lifecycle === "permanent" && centrality >= 5 && daysSinceUpdate < 30) → "high"
else if (daysSinceUpdate < 90) → "medium"
else → "low"
```

Git calls are read-only, scoped to top-N results only, and robust to missing repo/detached HEAD/empty history.

## Phase 2 — Temporal recall

`recall` gains opt-in `mode: "temporal"` for on-demand history exploration.

**Pipeline:** normal semantic recall first (including project bias) → then fetch git history for top N matched notes only.

History shape per note:
```ts
{ commitHash, timestamp, message, summary? }
```

Summary is compact diff-stat style: `+42/-10 lines`, `3 files changed`, `minor edit`, `substantial update`, `metadata-only change`. Never raw diffs.

`verbose: true` (only with `mode: "temporal"`) adds richer stats-based context. Even verbose avoids full diffs.

Bounded: top 3–5 notes, 3–5 commits each. No repo-wide scans. Default recall latency unchanged when temporal mode is not used.

**Non-goals:** no repo-wide timelines, no cross-note history stitching, no replacement of semantic recall with git traversal.

## Phase 3 — Projection layer

Projections are compact, deterministic derived representations used as embedding input instead of raw title+content.

**Schema** (stored in `vaultPath/projections/` as JSON, gitignored):
- `projectionText`: max 1200 chars — Title / Lifecycle / Tags / Summary / Headings
- `summary`: first non-heading paragraph → first bullet list → first 200 chars
- `headings`: h1–h3, deduplicated, max 8
- `updatedAt`: staleness anchor (matches note.updatedAt)

**Staleness:** `isProjectionStale = projection.updatedAt !== note.updatedAt`. No hashing needed.

**Lazy build:** `getOrBuildProjection` builds on demand, saves best-effort (never throws). Fallback: if build fails, embed uses raw title+content.

**Storage:** `Storage` gains `projectionsDir`, `projectionPath(id)`, `writeProjection()`, `readProjection()`. `ensureGitignore` adds both `embeddings/` and `projections/`.

## Phase 4 — Relationship expansion

Bounded 1-hop relationship previews attached to `recall`, `project_memory_summary`, and `get` results.

**Scoring:**
```
relationshipScore = sameProjectBoost + anchorBoost + recencyBoost + confidenceBoost
```

**Hard limits:** max 3 shown per note, absolute cap 5, `truncated: true` when more exist.

**Integration:**
- `project_memory_summary`: `primaryEntry` and `suggestedNext` always get previews if relations exist
- `recall`: top 1–3 results get previews; semantic ranking unchanged, expansion happens after selection
- `get`: `includeRelationships?: boolean` flag

**Selection rules:** 1-hop only (no recursion), same-project first, explicit `relatedTo` edges only (no semantic inference), anchor notes prioritized.

**Non-goals:** no recursive traversal, no semantic edge inference, no redesign of recall ranking, no graph visualizations.
