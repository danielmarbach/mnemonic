---
title: 'Session-start orientation: project_memory_summary design'
tags:
  - design
  - session-orientation
  - project-memory-summary
  - anchors
  - themes
lifecycle: permanent
createdAt: '2026-03-22T09:30:00.463Z'
updatedAt: '2026-03-24T10:55:20.655Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mcp-workflow-ux-hint-prompt-tool-descriptions-and-session-st-e89a18fc
    type: supersedes
memoryVersion: 1
---
## Design Decision: Thematic-First Session Orientation

**Context:** Agents were missing guidance on how to orient at session start. The original plan proposed `project_memory_summary` as the canonical entrypoint, but needed enhancement to return "most relevant current project notes" efficiently.

**Decision:** Hybrid thematic-first approach with optional semantic enhancement, plus explicit orientation layer for actionable guidance.

### Architecture

**No centroid computation required.** Anchors serve as the semantic reference points instead of computing a centroid over all project embeddings. This keeps Phase 0 cheap and deterministic.

**Output structure:**

```typescript
project_memory_summary(cwd) → {
  themes: Record<string, ThemeSection>,
  recent: RecentNote[],
  anchors: AnchorNote[],
  orientation: {
    primaryEntry: { id, title, rationale },
    suggestedNext: { id, title, rationale }[],
    warnings?: string[]
  },
  relatedGlobal?: { notes, computedAt }
}
```

### Orientation Layer

The orientation layer transforms raw data into actionable guidance:

- **primaryEntry**: Best first note to read, with rationale explaining why (centrality + themes)
- **suggestedNext**: 2-3 follow-up notes to read after primary, with rationale
- **warnings**: Optional signals like taxonomy dilution (other bucket > 30%)

**Rationale format:**

- Anchors: "Centrality X, connects Y themes"
- Fallback (no anchors): "Most recent note — no high-centrality anchors found" or "Only note available"

**Warning conditions:**

- More than 30% of notes in "other" bucket → suggests improving thematic classification

### Scoring Algorithms

**Within-theme ranking (for examples):**

```text
score = recencyScore + centralityBonus
where:
  recencyScore = 1.0 - min(1.0, daysSinceUpdate / 30)  // inverted: recent = higher
  centralityBonus = min(0.2, log(relatedTo.count + 1) * 0.1)  // log-scaled, capped
```

**Anchor selection:**

```text
filter: lifecycle === permanent
score = 0.4 * log(relatedTo.count + 1)
      + 0.4 * connectionDiversity  // distinct themes of related notes
      + 0.2 * recencyBoost(days)

constraint: max 2 anchors per theme
override: notes tagged 'anchor' or 'alwaysLoad' (capped at 10 total)
```

**Tagged anchor handling:**

- Notes with `anchor` or `alwaysLoad` tags are collected separately before relationship-count filter
- This allows permanent notes without relationships to still qualify as anchors via tag override
- Tagged anchors are added first, then scored anchors fill remaining slots

**Project-scoped filtering:**

- Themes, anchors, and recent notes use only project-scoped notes (`projectEntries`)
- Global notes appear ONLY in optional `relatedGlobal` section when `includeRelatedGlobal: true`

**Related global notes (optional, anchor-based):**

```text
1. Collect anchor note embeddings (lazy, already computed)
2. For each global note, find max similarity to any anchor
3. Return global notes where maxAnchorSimilarity > 0.4
4. Order by max similarity, return top 3
```

### Key Design Choices

1. **Thematic organization** - Notes grouped by theme (overview, decisions, tooling, bugs, architecture, quality, other) for deterministic, predictable output
2. **Recency inverted** - Higher score = more recent (not days-since update)
3. **Connection diversity** - Anchors that connect multiple themes score higher than single-cluster hubs
4. **Tag override** - Users can explicitly mark notes as anchors with `anchor` or `alwaysLoad` tags, works regardless of relationship count
5. **Optional global notes** - Embeddings only computed when `includeRelatedGlobal: true`, using anchor embeddings as reference (not centroid)
6. **No mandatory embeddings** - Base functionality works without any embedding computation
7. **Orientation layer** - Explicit guidance on where to start and what to read next, with rationale

### Why Orientation Layer

Raw data (themes, anchors, recent) requires the agent to infer:

- Which note to read first
- Why it matters
- What to read next

The orientation layer provides:

- **primaryEntry**: The definitive starting point with rationale
- **suggestedNext**: 2-3 follow-ups with rationale
- **warnings**: Signal when taxonomy needs attention

This makes the tool immediately actionable without requiring agent inference.

### Alternatives Considered

**Semantic-first with centroid:** Rejected due to computational cost and coupling to embedding availability. Would require forced embedding computation for meaningful results.

**Pure centrality anchors:** Too generic - a note with many connections within one theme isn't a good cross-cutting anchor. Added diversity scoring.

**Unranked filter for anchors:** Too noisy. Would return all permanent notes with connections instead of the best hubs.

**Tag-only anchors:** Rejected as requiring manual curation. Hybrid approach allows automatic discovery plus manual override.

**No orientation layer:** Rejected - raw data (themes, anchors) requires agent inference. Explicit guidance is more useful for session-start orientation.

### Performance Characteristics

- Themed curation: O(n) note iteration
- Anchor scoring: O(n) filter + O(k log k) sort where k = anchor candidates
- Global similarity: O(a × g) where a = anchors with embeddings, g = global notes
- No centroid computation
- No forced embedding backfill
