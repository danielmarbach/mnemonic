---
title: 'Phase 4: Relationship Expansion Design'
tags:
  - phase-4
  - design
  - relationship-expansion
  - mnemonic
lifecycle: permanent
createdAt: '2026-03-23T19:43:46.893Z'
updatedAt: '2026-03-23T19:45:05.295Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
## Phase 4: Relationship Expansion - Design Decisions

### Core Principles

1. **Bounded expansion** - 1-hop only, no recursive traversal
2. **Project-local first** - same project prioritized over global
3. **Enrichment layer** - doesn't redesign recall scoring or replace semantic retrieval
4. **Navigation not noise** - small number of useful related notes, avoid giant lists
5. **Existing relationships only** - use `relatedTo` edges, no inferred semantic relationships

### Architecture

**New module:** `src/relationships.ts`

- Post-processing layer like temporal/provenance enrichment
- Collects direct related notes from existing `relatedTo` edges
- Scores and prioritizes (same-project boost, anchor boost, recency boost)
- Returns bounded previews (max 3 shown, hard max 5, truncated flag)

### Data Model

```typescript
interface RelatedNotePreview {
  id: string;
  title: string;
  projectId?: string;
  theme?: string;
  relationType?: RelationshipType;
  updatedAt: string;
  confidence?: "high" | "medium" | "low";
}

interface RelationshipPreview {
  totalDirectRelations: number;
  shown: RelatedNotePreview[];
  truncated: boolean;
}
```

### Scoring Heuristic

```typescript
relationshipScore = sameProjectBoost + anchorBoost + recencyBoost + confidenceBoost
```

- same project: strong boost
- anchor: medium boost
- recent (5 days): small boost
- confidence (permanent + high centrality): small boost

### Selection Rules

1. Only direct relations (1-hop, no recursion)
2. Same active project first
3. Explicit relationship presence required
4. Anchor notes prioritized
5. Recently updated notes get slight boost
6. Cross-project only if directly related

**Hard limits:**

- Max shown per note: 3
- Hard max if expanded: 5
- truncated: true when more exist

### Integration Points

#### A. project_memory_summary

- `primaryEntry`: always gets relationship preview if relations exist
- `suggestedNext`: gets preview if useful direct connections exist
- `recent`: gets preview only when count non-trivial AND output stays bounded

#### B. recall

- Top 1 result gets preview by default
- Top 3 if result count small and output stays compact
- No preview on low-ranked results
- Semantic ranking unchanged - expansion after selection

#### C. get

- Check if `includeRelations` already exists
- If yes: improve output quality (prioritized, bounded, project-aware)
- If no: add optional `includeRelationships?: boolean` flag

### Fail-Soft Behavior

- Additive, optional
- If expansion fails, omit preview
- Core result remains intact

### Non-Goals (Explicitly Excluded)

- No recursive graph traversal
- No semantic edge inference
- No redesign of recall ranking
- No theme/role-based weighting
- No graph visualizations
- No raw adjacency dumps

### Implementation Steps

1. Inspect current relationship storage and access paths
2. Create src/relationships.ts with helpers
3. Implement deterministic scoring
4. Build bounded preview construction
5. Integrate into project_memory_summary
6. Integrate into recall
7. Integrate into get
8. Add tests

### Test Categories

**A. Relationship selection** - only direct relations, same-project prioritized, limit respected, truncated flag, unrelated notes excluded
**B. Scoring** - anchor outranks non-anchor, recent gets boost, same-project wins over global
**C. Summary integration** - primaryEntry gets preview, output bounded, no block when no relations
**D. Recall integration** - ranking unchanged, preview attached after selection, failure doesn't break recall
**E. Get integration** - includeRelations returns bounded previews, 1-hop only, stable output

### Acceptance Criteria

1. project_memory_summary shows bounded relationship previews for key entry points
2. recall shows useful direct related notes for selected results
3. get shows bounded direct relation previews
4. Relationship expansion remains 1-hop only
5. Same-project related notes are prioritized
6. Recall ranking semantics remain unchanged
7. Failures in relationship expansion don't break main operation
8. Output stays compact and readable
