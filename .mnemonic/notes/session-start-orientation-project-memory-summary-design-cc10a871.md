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
updatedAt: '2026-03-22T09:30:00.463Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
## Design Decision: Thematic-First Session Orientation

**Context:** Agents were missing guidance on how to orient at session start. The original plan proposed `project_memory_summary` as the canonical entrypoint, but needed enhancement to return "most relevant current project notes" efficiently.

**Decision:** Hybrid thematic-first approach with optional semantic enhancement.

### Architecture

**No centroid computation required.** Anchors serve as the semantic reference points instead of computing a centroid over all project embeddings. This keeps Phase 0 cheap and deterministic.

**Output structure:**

```typescript
project_memory_summary(cwd) → {
  themes: Record<string, ThemeSection>,
  recent: RecentNote[],
  anchors: AnchorNote[],
  relatedGlobal?: { notes, computedAt }
}
```

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
4. **Tag override** - Users can explicitly mark notes as anchors with `anchor` or `alwaysLoad` tags
5. **Optional global notes** - Embeddings only computed when `includeRelatedGlobal: true`, using anchor embeddings as reference (not centroid)
6. **No mandatory embeddings** - Base functionality works without any embedding computation

### Why Anchor-Based Similarity

Computing a centroid requires:

- Loading all project note embeddings
- Computing the mathematical centroid
- This is expensive and couples the feature to embedding availability

Using anchors instead:

- Anchors are already filtered and scored (cheap)
- Most anchors already have embeddings (written at creation time)
- Max-similarity-to-anchors is mathematically equivalent for global note relevance
- Fails gracefully: no anchors with embeddings = no global matches, still returns themed/anchor/recent data

### Performance Characteristics

- Themed curation: O(n) note iteration
- Anchor scoring: O(n) filter + O(k log k) sort where k = anchor candidates
- Global similarity: O(a × g) where a = anchors with embeddings, g = global notes
- No centroid computation
- No forced embedding backfill

### Alternatives Considered

**Semantic-first with centroid:** Rejected due to computational cost and coupling to embedding availability. Would require forced embedding computation for meaningful results.

**Pure centrality anchors:** Too generic - a note with many connections within one theme isn't a good cross-cutting anchor. Added diversity scoring.

**Unranked filter for anchors:** Too noisy. Would return all permanent notes with connections instead of the best hubs.

**Tag-only anchors:** Rejected as requiring manual curation. Hybrid approach allows automatic discovery plus manual override.
