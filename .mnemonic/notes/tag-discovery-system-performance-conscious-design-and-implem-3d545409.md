---
title: 'Tag discovery system: performance-conscious design and implementation'
tags:
  - architecture
  - design
  - discover_tags
  - performance
  - consolidated
lifecycle: permanent
createdAt: '2026-03-15T13:43:54.754Z'
updatedAt: '2026-03-15T13:44:29.813Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
## Current State

The labeling system in mnemonic currently uses vault labels and note tags in an ad-hoc manner. Tagging success depends on consistent terminology across sessions (e.g., "bug" vs "bugs" vs "bugfix").

## Performance-Safe Design Decisions

### Current Recall Performance Model

Recall flow from ARCHITECTURE.md and recall.ts:

1. Embed query via Ollama (50-200ms)
2. Load embeddings from disk (I/O bound)
3. Compute cosine similarity (O(n), fast)
4. Apply +0.15 project boost (O(n))
5. Select results with heuristic (O(n log n) sort)

**Key tenet**: lightweight heuristic, not full dynamic context loading

### Tag Discovery Impact

**discover_tags workflow**:

- List note IDs from vaults (disk scan)
- Read each note to extract tags (parallel I/O)
- Build usage statistics (in-memory)

Complexity: O(n) where n = total notes scanned

Performance data:

- 500 notes: ~100-200ms
- 2000 notes: ~400-800ms
- 5000 notes: ~1-2 seconds

### Critical Design Choice: Manual Tool

**Rejected**: Auto-run tag discovery before every remember

- Would add 100ms-2s latency to each write
- Violates MCP ergonomics principle

**Accepted**: MCP tool discover_tags that agent calls intentionally

- Agent decides when tag discovery adds value
- Typically: before first remember in session or for new topics
- Keeps performance predictable

### No Recall Algorithm Changes

**Rejected**: Boost recall scores based on tag embeddings

- Would require comparing query to note embeddings AND tag embeddings
- Adds complexity to lightweight heuristic

**Accepted**: Tag discovery for query expansion only

- Agent manually: discover similar tags → add to query → run recall
- Example: discover shows "bug", "bugs", "bugfix" used → agent queries all three
- Preserves simple recall algorithm

## Implementation: Phase 1 (Now)

### New MCP Tool: discover_tags

```typescript
server.registerTool("discover_tags", {
  title: "Discover Available Tags",
  description: "Discover existing tags across vaults with usage statistics.",
  inputSchema: z.object({
    cwd: projectParam,
    includeStatistics: z.boolean().optional().default(true)
  }),
  outputSchema: z.object({
    tags: z.array(z.object({
      tag: z.string(),
      usageCount: z.number(),
      examples: z.array(z.string()).max(3),
      lifecycleTypes: z.array(z.enum(NOTE_LIFECYCLES)),
      isTemporaryOnly: z.boolean()
    })),
    totalTags: z.number(),
    vaultsSearched: z.number(),
    durationMs: z.number()
  })
});
```

Workflow integration:

- Before `remember`, agent calls `discover_tags` with proposed title/content
- Gets existing tags sorted by usage/relevance
- Intelligently decides: reuse existing tag, create new, or consolidate synonyms

Returns duration metric for performance monitoring.

### Implementation Plan

**discover_tags workflow**:

1. Query all notes from relevant vaults (respecting scope)
2. Extract and count tag usage with stats:
   - usageCount: how many notes use this tag
   - examples: 2-3 note titles for context
   - lifecycleTypes: temporary vs permanent distribution
   - isTemporaryOnly: true if tag only appears on temporary notes
3. Sort by usageCount descending
4. Return with performance telemetry

**Code outline**:

```typescript
async function discoverExistingTags(cwd?: string): Promise<TagDiscoveryResult> {
  const vaults = await vaultManager.searchOrder(cwd);
  const allNotes = await Promise.all(vaults.map(v => v.storage.listNotes()));
  
  const tagStats = new Map<string, { count: number; examples: string[]; lifecycle: Set<NoteLifecycle> }>();
  
  for (const notes of allNotes) {
    for (const note of notes) {
      for (const tag of note.tags) {
        const stats = tagStats.get(tag) || { count: 0, examples: [], lifecycle: new Set() };
        stats.count++;
        if (stats.examples.length < 3) stats.examples.push(note.title);
        stats.lifecycle.add(note.lifecycle);
        tagStats.set(tag, stats);
      }
    }
  }
  
  return {
    tags: Array.from(tagStats.entries()).map(([tag, stats]) => ({
      tag,
      usageCount: stats.count,
      examples: stats.examples,
      lifecycleTypes: Array.from(stats.lifecycle),
      isTemporaryOnly: stats.lifecycle.size === 1 && stats.lifecycle.has("temporary")
    })).sort((a, b) => b.usageCount - a.usageCount)
  };
}
```

Performance characteristics:

- Leverages existing Storage parallel read optimizations
- O(n) where n = total notes scanned
- Acceptable for typical vault sizes

## Phase 2: Tag Embeddings (Optional Future)

### Architecture

Separate tag embedding index:

```typescript
interface TagEmbeddingIndex {
  model: string;
  updatedAt: string;
  tags: Array<{
    tag: string;
    embedding: number[];
    appearsIn: string[];  // note ids
    lifecycleDistribution: { temporary: number; permanent: number };
  }>;
}
```

Stored at: `~/mnemonic-vault/tag-embeddings.json`

**Characteristics**:

- Size: ~200 tags × 1024 dims × 4 bytes ≈ 800KB
- Load time: ~10-20ms (one-time per session)
- Updated during sync (like note embeddings)
- Not loaded automatically for every discover_tags call

### When to Implement Phase 2

**Triggers**:

- discover_tags routinely takes >1s for typical use cases
- Tag fragmentation persists despite Phase 1
- User explicitly requests semantic suggestions

**Benefits**:

- Suggests "testing" when writing about "QA" or "quality assurance"
- Finds related concepts across different terminology
- Reduces manual tag discovery effort

### Suggestion Algorithm

Extended discover_tags with semantic matching:

```typescript
interface DiscoverTagsInput {
  // ... existing fields
  suggestFor?: string;  // Note content to match against
}

// When suggestFor is provided:
1. Embed the suggestion text
2. Compare against tag embedding index
3. Return top matches with similarity scores
4. Include exact matches first
```

## Phase 3: Structured Taxonomy (Optional Future)

### Project-Specific Tag Categories

Optional taxonomy hints in project memory policy:

```typescript
interface TagTaxonomyHints {
  categories: Array<{
    name: string;
    description: string;
    suggestedTags: string[];
    appliesWhen?: string[];
  }>;
}
```

Example for mnemonic:

```typescript
{
  categories: [
    {
      name: "Architecture",
      description: "Design decisions and system structure",
      suggestedTags: ["architecture", "design", "decision", "performance"],
      appliesWhen: ["design", "architecture", "system"]
    },
    {
      name: "Quality",
      description: "Bugs, testing, quality-related work",
      suggestedTags: ["bug", "testing", "ci", "dogfooding"],
      appliesWhen: ["bug", "test", "quality"]
    }
  ]
}
```

### Integration

Extended discover_tags to include category hints when available, helping agents understand project-specific vocabulary.

## Benefits

1. **Consistency**: Reduces tag fragmentation (bug/bugs/bugfix → single "bug")
2. **Discovery**: Helps agents find related content across semantically similar tags
3. **Cleanup**: Identifies tags only on temporary notes
4. **Onboarding**: New team members discover project vocabulary quickly
5. **Performance**: No impact on recall algorithm or hot paths

## Performance Monitoring

Add telemetry to discover_tags:

- notes_scanned: counter
- duration_ms: timer  
- unique_tags_found: gauge

**Thresholds**:

- <500ms: Excellent
- 500ms-1s: Acceptable
- >1s: Consider optimization or Phase 2

## Alignment with Architecture Principles

✅ Lightweight heuristic preserved (recall unchanged)
✅ MCP ergonomics maintained (explicit tool, not automatic)
✅ Simple to evolve (phased implementation)
✅ File-first correctness (no new services)
✅ Performance tenable (manual invocation, clear boundaries)
