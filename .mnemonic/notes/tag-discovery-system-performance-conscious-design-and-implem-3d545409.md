---
title: 'Tag discovery system: performance-conscious design and implementation'
tags:
  - architecture
  - design
  - discover_tags
  - performance
  - consolidated
  - implemented
lifecycle: permanent
createdAt: '2026-03-15T13:43:54.754Z'
updatedAt: '2026-03-24T06:11:13.001Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
## Current State

The labeling system in mnemonic currently uses vault labels and note tags in an ad-hoc manner. Tagging success depends on consistent terminology across sessions (e.g., `bug` vs `bugs` vs `bugfix`).

## Implementation Status

**Phase 1: IMPLEMENTED** ✅

The current `discover_tags` MCP tool is available in `src/index.ts` with:

- Input parameters: `cwd`, `scope`, `storedIn` (matching `list` tool semantics)
- Output: tags sorted by usageCount with examples, lifecycleTypes, and isTemporaryOnly flag
- structuredContent schema in `src/structured-content.ts`
- Integration test coverage in `tests/mcp.integration.test.ts`
- Performance telemetry: `durationMs` in response

## Updated Design Direction

The current implementation proved the value of canonical tag discovery, but its broad structured output can become too large and can expose many unrelated tags to the model.

**New direction:** keep the tool name `discover_tags`, but make its default behavior note-oriented rather than corpus-oriented.

### Default behavior should become compact and note-specific

The caller should provide note context such as:

- `title`
- `content`
- `query`
- optional candidate tags

The tool should then return ranked canonical tag suggestions for that note instead of the entire tag inventory.

### Ranking principle

Rank by:

1. relevance to the note context
2. usage count as a canonicality boost
3. lifecycle distribution as a quality signal

This preserves the original anti-fragmentation goal without overwhelming the agent with unrelated but common tags.

### Output principle

Default structured output should be compact:

- recommended tags for the note
- small evidence payload, such as one example title or a short reason
- no full corpus-wide tag dump unless broad browsing is explicitly requested

## Performance-Safe Design Decisions

### Current Recall Performance Model

Recall flow from `ARCHITECTURE.md` and `recall.ts`:

1. Embed query via Ollama (50-200ms)
2. Load embeddings from disk (I/O bound)
3. Compute cosine similarity (O(n), fast)
4. Apply +0.15 project boost (O(n))
5. Select results with heuristic (O(n log n) sort)

**Key tenet**: lightweight heuristic, not full dynamic context loading

### Tag Discovery Impact

**Current discover_tags workflow**:

- List note IDs from vaults (disk scan)
- Read each note to extract tags (parallel I/O)
- Build usage statistics (in-memory)

Complexity: O(n) where n = total notes scanned

Performance data:

- 500 notes: ~100-200ms
- 2000 notes: ~400-800ms
- 5000 notes: ~1-2 seconds

### Critical Design Choice: Manual Tool

**Rejected**: Auto-run tag discovery before every `remember`

- Would add 100ms-2s latency to each write
- Violates MCP ergonomics principle

**Accepted**: MCP tool `discover_tags` that the agent calls intentionally

- Agent decides when tag discovery adds value
- Tag discovery should be used when tag choice is ambiguous, not as a mandatory pre-step for every write
- Keeps performance predictable and output bounded

### No Recall Algorithm Changes

**Rejected**: Boost recall scores based on tag embeddings

- Would require comparing query to note embeddings and tag embeddings
- Adds complexity to the lightweight heuristic

**Accepted**: note-oriented tag suggestion without redesigning recall

- The tool can use note context to rank canonical tags
- Recall stays focused on note retrieval, not tag-taxonomy management
- This preserves the simple recall algorithm while improving write-time guidance

## Current Implementation: Phase 1 ✅

### Current MCP Tool

The current implementation is still corpus-oriented and returns vault-wide tag statistics. That remains useful as the starting point, but it should now be treated as an intermediate step rather than the final design.

Workflow intent:

- Agent provides proposed note context
- Tool returns a compact set of relevant canonical tags
- Agent reuses existing tags or creates a new tag only when genuinely novel

## Future Direction

### Phase 2: Note-Oriented Suggestions

Evolve `discover_tags` so that the default mode accepts note context and returns a compact ranked set of canonical tag suggestions.

This phase should also tighten tool descriptions and related documentation so the project consistently describes `discover_tags` as a note-oriented suggestion tool rather than a general tag dump.

### Broad Browsing Remains Explicit

If full corpus browsing remains useful for administration or manual exploration, it should be an explicit mode rather than the default experience.

## Benefits

1. **Consistency**: reduces tag fragmentation (`bug`/`bugs`/`bugfix` → canonical choice)
2. **Relevance**: avoids flooding the agent with unrelated tags
3. **Compactness**: reduces token-heavy structured output
4. **Confidence**: still gives enough evidence to trust suggested tags
5. **Performance**: keeps recall unchanged and preserves explicit invocation

## Alignment with Architecture Principles

✅ Lightweight heuristic preserved (`recall` unchanged)
✅ MCP ergonomics maintained (explicit tool, not automatic)
✅ Better bounded outputs for LLM consumers
✅ Original anti-hallucination goal preserved
✅ Documentation and agent guidance can be tightened around the new contract

## Specificity tuning follow-up

After dogfooding the first note-oriented release, scoring was rebalanced toward specificity because broad tags were still dominating the top results for clearly scoped prompts.

- stronger exact-match boost for tags named directly in the note context
- lower usage-count weight so popularity acts as a tie-breaker rather than the primary ranking signal
- average per-note context match is used instead of letting large broad tag clusters dominate via raw totals
- conditional generic-tag penalty for broad high-frequency single-token tags when a strong specific candidate exists
- generic prompts fall back toward broader canonical tags instead of returning full inventory output
- browse mode remains unchanged and inventory-oriented

## Generalized heuristic rule

The final tuning was validated against a synthetic sparse-project scenario as well as this repository's own corpus.

- exact matches on genuinely specific tags should trigger specificity-heavy ranking even if the tag exists only once
- generic prompts should continue to use the broad canonical fallback path
- broad one-off exact matches should not be enough to flip the entire ranking into specificity mode
- this keeps the heuristic useful both for mature repos with many tags and for smaller projects with sparse tag histories
