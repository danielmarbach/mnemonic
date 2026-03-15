---
title: >-
  Label system design: structured taxonomy with LLM assistance and semantic
  discovery
tags:
  - architecture
  - design
  - labels
  - tagging
  - taxonomy
  - embeddings
  - llm-assisted
  - research
lifecycle: temporary
createdAt: '2026-03-15T13:34:16.945Z'
updatedAt: '2026-03-15T13:34:16.945Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
## Current State

The labeling system in mnemonic currently uses:

1. **Vault labels**: `"main-vault"`, `"project-vault"`, or `"sub-vault:<folder>"` (e.g., `sub-vault:.mnemonic-lib`)
2. **Note tags**: Freeform string arrays in YAML frontmatter, currently used in an ad-hoc manner

**Current tagging patterns observed**:

- Architecture/decision notes: `[architecture, vault, multi-vault, design, decision]`
- Bug-related: `[bug, migration, mcp, schema, fixed]`
- Feature work: `[design, consolidation, mcp-tool, architecture]`
- CI/testing: `[ci, testing, mcp, github-actions]`
- Dogfooding: `[dogfooding, mcp, developer-workflow]`

## Problem Statement

The current tagging approach is "lucky" - success depends on:

- Consistent terminology across sessions (e.g., "bug" vs "bugs" vs "bugfix")
- Remembering existing tags to maintain consistency
- Manual effort to check existing tags before creating new ones
- No semantic relationship between tags (e.g., "testing" and "test" are unrelated)

## Proposed Architecture

### Layer 1: Existing Tag Embeddings (Immediate)

**Goal**: Make the LLM aware of existing tags before creating new ones

**Implementation**:

```typescript
// Build a tag corpus from all notes
async function discoverExistingTags(cwd?: string): Promise<TagDiscoveryResult> {
  const vaults = await vaultManager.searchOrder(cwd);
  const allNotes = await Promise.all(vaults.map(v => v.storage.listNotes()));
  
  // Extract and count tag usage
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
    }))
  };
}
```

**Key design decisions**:

- Include tag usage statistics (count, examples) to help LLM understand semantic meaning
- Mark tags that only appear on temporary notes (cleanup candidates)
- Provide 2-3 example note titles to show context
- No embeddings yet - just statistical discovery

### Layer 2: Tag Embeddings for Semantic Similarity (Phase 2)

**Goal**: Enable semantic tag suggestions based on what the user is writing

**Architecture**:

```typescript
interface TagSuggestion {
  tag: string;              // Exact existing tag
  similarity: number;       // Cosine similarity score
  distance: 'exact' | 'semantic' | 'none';  // How it matches
  sources: string[];        // Which notes contain this tag
  confidence: 'high' | 'medium' | 'low';
}

// Store tag embeddings separately from note embeddings
// Path: ~/mnemonic-vault/tag-embeddings.json
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

**Tag embedding process**:

1. Extract all unique tags from all vaults
2. Generate embeddings for each tag text independently
3. Store in a separate index (not mixed with note embeddings)
4. Update during sync when new tags appear

**Suggestion algorithm**:

1. As user writes a note title/content, extract candidate terms/phrases
2. Embed the candidate terms
3. Compare against tag embedding index
4. Return top N matches with similarity scores
5. Include exact matches (100% similarity) first

### Layer 3: Structured Taxonomy Hints (Phase 3)

**Goal**: Provide domain-specific tag categories based on project type

**Implementation**:

```typescript
// In project memory policy or config.json
interface TagTaxonomyHints {
  categories: Array<{
    name: string;
    description: string;
    suggestedTags: string[];
    appliesWhen?: string[];  // Content patterns that trigger this category
  }>;
}

// Example for mnemonic project:
const mnemonicTaxonomy = {
  categories: [
    {
      name: "Architecture",
      description: "Design decisions and system structure",
      suggestedTags: ["architecture", "design", "decision", "scalability", "performance"],
      appliesWhen: ["design", "architecture", "system", "component"]
    },
    {
      name: "Quality",
      description: "Bugs, testing, and quality-related work",
      suggestedTags: ["bug", "testing", "ci", "regression", "dogfooding"],
      appliesWhen: ["bug", "test", "ci", "quality", "regression"]
    },
    {
      name: "Process",
      description: "Workflow, tooling, and developer experience",
      suggestedTags: ["workflow", "tooling", "dogfooding", "developer-workflow"],
      appliesWhen: ["process", "workflow", "tooling", "developer"]
    }
  ]
};
```

**Design considerations**:

- Taxonomy is opt-in per project (stored in project memory policy)
- Hints are suggestions, not constraints (LLM can still create new tags)
- Category descriptions help LLM understand when to apply which tags

## Integration Strategy

### New MCP Tool: `discover_tags`

```typescript
server.registerTool("discover_tags", {
  title: "Discover Available Tags",
  description: "Discover existing tags across vaults with usage statistics and semantic similarity suggestions.",
  inputSchema: z.object({
    cwd: projectParam,
    includeStatistics: z.boolean().optional().default(true),
    suggestFor: z.string().optional().describe("Note title/content to get tag suggestions for")
  }),
  outputSchema: z.object({
    tags: z.array(z.object({
      tag: z.string(),
      usageCount: z.number(),
      examples: z.array(z.string()),
      lifecycleTypes: z.array(z.enum(NOTE_LIFECYCLES)),
      isTemporaryOnly: z.boolean(),
      suggestions: z.array(z.object({
        similarity: z.number(),
        confidence: z.enum(["high", "medium", "low"]),
        triggeredBy: z.string().optional()
      })).optional()
    })),
    totalTags: z.number(),
    vaultsSearched: z.number()
  })
});
```

**Workflow integration**:

- Before `remember`, the agent calls `discover_tags` with the proposed title/content
- Gets back existing tags sorted by usage/relevance
- Can intelligently decide: reuse existing tag, create new tag, or consolidate synonyms

### Enhanced `remember` Tool

```typescript
// Add to remember input schema
tags: z.array(z.string()).optional().describe(
  "Tags for categorization. Call discover_tags first to see existing tags and avoid creating near-duplicates like 'bug' vs 'bugs'."
)
```

## Benefits

1. **Consistency**: Reduces tag fragmentation (bug/bugs/bugfix → single canonical "bug")
2. **Discovery**: LLM can find related content across different but semantically similar tags
3. **Cleanup**: Identify tags that only appear on temporary notes (cleanup candidates)
4. **Onboarding**: New team members can discover the project's vocabulary quickly
5. **Evolution**: Tag corpus evolves naturally with the project, no manual curation needed

## Trade-offs

1. **Performance**: Additional tag discovery adds 100-500ms before `remember`
2. **Complexity**: Separate tag embedding index to maintain
3. **Storage**: Tag embeddings are small (~50-200 tags × 1024 dims × 4 bytes ≈ 200-800KB)
4. **Freshness**: Tags only discovered from existing notes, not from external sources

## Future Enhancements

1. **Tag relationships**: Explicitly relate tags (e.g., "bug" → "testing")
2. **Auto-cleanup**: Suggest consolidating near-duplicate tags across vaults
3. **Tag usage trends**: Track tag popularity over time
4. **Cross-project tag sharing**: Global tags that span multiple projects

## Open Questions

1. Should we store tag embeddings in the main vault or project vaults?
   - Proposal: Main vault only, as tags often span projects
2. How often to refresh tag embeddings?
   - Proposal: During sync, and when `discover_tags` detects new tags
3. Should we provide synonyms/concept mapping?
   - Proposal: Start with exact string match + semantic similarity, evolve to explicit mappings later
