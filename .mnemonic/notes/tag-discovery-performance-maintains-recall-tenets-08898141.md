---
title: Tag discovery performance maintains recall tenets
tags:
  - performance
  - recall
  - architecture
  - discover_tags
lifecycle: permanent
createdAt: '2026-03-15T13:40:27.384Z'
updatedAt: '2026-03-15T13:40:27.384Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
## Performance-Safe Design Decisions

### Current Recall Performance

Recall flow from ARCHITECTURE.md and recall.ts:

1. Embed query via Ollama (50-200ms)
2. Load embeddings from disk (I/O bound)
3. Compute cosine similarity (O(n), fast CPU)
4. Apply +0.15 project boost (O(n))
5. Select results with heuristic (O(n log n) sort)

Key tenet: lightweight heuristic, not full dynamic context loading

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

**Rejected**: Auto-run before every remember

- Adds 100ms-2s latency to each write
- Violates MCP ergonomics principle
- User calls explicitly when needed

**Accepted**: MCP tool discover_tags that agent calls intentionally

- Agent decides when tag discovery adds value
- Typically: before first remember in session or for new topics
- Keeps performance predictable

### No Recall Algorithm Changes

**Rejected**: Boost recall scores based on tag embeddings

- Would require comparing query to note embeddings AND tag embeddings
- Adds complexity to lightweight heuristic
- Unclear benefit for typical recall queries

**Accepted**: Tag discovery for query expansion only

- Agent manually: discover similar tags → add to query → run recall
- Example: discover shows "bug", "bugs", "bugfix" used → agent queries all three
- Preserves simple recall algorithm

### Implementation Strategy

**discover_tags** returns duration metric for observability

**Tag embeddings (Phase 2)**:

- Separate file: ~/mnemonic-vault/tag-embeddings.json
- Updated during sync (not per-call)
- Read once per session (10-20ms load time)
- Size: ~200 tags × 1024 dims × 4 bytes ≈ 800KB

**Query expansion**:

```typescript
Agent calls discover_tags() // 100-500ms
Then recall(query + " OR " + relatedTag) // Multiple calls
Or recall(query + " " + similarTags.join(" OR ")) // Single call
```

### Performance Monitoring

Add telemetry:

- notes_scanned counter
- duration_ms timer  
- unique_tags_found gauge

Threshold: If discover_tags routinely takes >1s, consider caching or moving to Phase 2

### Alignment Check

Matches ARCHITECTURE.md principles:

- Lightweight heuristic preserved
- MCP ergonomics maintained
- Simple to evolve with phases
- File-first correctness
- Simplicity over optimization
