---
title: 'Plan: enrich decision points with retrieval rationale and trust signals'
tags:
  - explain
  - consolidate
  - recall
  - design
  - plan
  - evidence
lifecycle: temporary
createdAt: '2026-04-26T10:11:01.959Z'
updatedAt: '2026-04-26T10:11:07.464Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: research-explain-before-consolidate-value-assessment-and-des-f1b237dc
    type: derives-from
  - id: rpir-workflow-design-for-mnemonic-research-plan-implement-re-80b00851
    type: follows
memoryVersion: 1
---
# Plan: enrich decision points with retrieval rationale and trust signals

## Decision: enrich existing tools, no new explain tool

The proposal for `explain` before `consolidate` identified a real gap: LLMs currently mutate memory from text alone, without seeing ranking evidence, lineage, freshness, or trust signals. But a separate `explain` tool is the wrong shape for mnemonic.

**Why no separate explain tool:**

- mnemonic is the store, not the runtime — explain as a step risks making the tool a reasoning engine
- session state for last-recall references is fragile in a stateless stdio MCP
- signals are already computed during recall — re-computing them in a separate call wastes work
- token budgets break when every recall result gets a full provenance dump
- the established pattern is opt-in enrichment at the decision point, like mode: temporal

**Why enrich at decision points:**

- recall already computes 15+ signals per candidate that are discarded before output
- consolidate already iterates all entries but only shows cosine similarity
- adding 2-3 lines per result/candidate is token-efficient and atomic
- follows established opt-in patterns (mode: temporal, verbose, includeRelationships)

## Phase 1 — Recall retrieval evidence (opt-in)

Add `includeEvidence: boolean` parameter to `recall`. When true, each result includes a compact `retrievalEvidence` block.

### Structured output shape

```typescript
retrievalEvidence?: {
  semanticRank: number;
  lexicalRank?: number;
  channels: Array<
    "semantic" | "lexical-rescue" | "graph-spreading" |
    "temporal-boost" | "canonical-explanation"
  >;
  isCurrentProject: boolean;
  supersededBy?: string;   // id of note that supersedes this one
  supersededCount?: number; // count of notes this one supersedes
  ageDays: number;
}
```

### Plain text format (2-3 lines per result)

```text
Rank #2 semantic, #1 lexical | channels: semantic, graph-spreading(2 hops)
permanent, decision | updated 5 days ago | supersedes 2 notes
```

### Signal source mapping

- `semanticRank`: already computed in recall pipeline (assignDenseRanks)
- `lexicalRank`: already computed in recall pipeline
- `channels`: derived from candidate state (rescue candidates get lexical-rescue, graph-discovered get graph-spreading, temporal-boosted get temporal-boost, promoted canonical explanations get canonical-explanation)
- `isCurrentProject`: already on ScoredRecallCandidate
- `supersededBy` / `supersedCount`: computed from existing relatedTo relationships (type supersedes)
- `ageDays`: computed from note.updatedAt

### Phase 1 constraints

- Default false — no output change for existing callers
- Fail-soft: if relationship data is unavailable, omit supersededBy/supersedCount
- Token budget: ~2 additional lines per result in text output, ~8 fields in structured output
- No session state required

## Phase 2 — Consolidate enrichment

Enrich detect-duplicates, find-clusters, and suggest-merges output with per-note trust and lineage metadata.

### Per-note enrichment in consolidate output

For each note mentioned in strategies:

```text
Note A (0.923) | permanent, decision | updated 2 days ago | supersedes 1 note
Note B (0.891) | temporary, research | updated 30 days ago | no relationships
Note C (0.854) | permanent, context | updated 5 days ago | 3 related notes
```

### Structured output addition

```typescript
// On each note in suggestions/clusters/duplicates
metadata?: {
  lifecycle: "temporary" | "permanent";
  role?: string;
  ageDays: number;
  supersededBy?: string;
  supersededCount?: number;
  relatedCount: number;
}
```

### Heuristic warnings in suggest-merges

- Temporary research note in merge suggestion — consider whether it contains unique evidence
- Note that supersedes another note in merge suggestion — merging may create orphaned supersedes chain
- Newer note would be merged into older summary — stale summary risk
- Notes with same role but different lifecycles — verify intent

### Phase 2 constraints

- Always included (not opt-in) — essential at the consolidation decision point
- No additional I/O: lifecycle, role, updatedAt, and relatedTo are already in memory during strategies
- Supersession chain data requires scanning relatedTo (already loaded per entry)
- ageDays computed from updatedAt (no git call needed)

## Phase 3 — Get enrichment (opt-in, lower priority)

Add `includeEvidence: boolean` to `get`. When true, include supersededBy, supersedes chain, and relationship health metadata for individual note inspection.

Lower priority since get already returns full relationships and the primary gap is at recall and consolidate decision points.

## Mapping to original proposal

- `mnemonic explain --last-recall` becomes `recall(includeEvidence: true)` — atomic, no session state
- `mnemonic explain "query text"` becomes `recall` with `includeEvidence: true`
- `mnemonic explain note-id` becomes `get` with `includeEvidence: true` (Phase 3)
- Separate reasoning artifact becomes enriched output at existing decision points
- New storage for explain results becomes no new storage — signals are computed in-memory

## Success criteria

- Fewer accidental bad merges (temporary research merged into permanent decisions)
- Fewer stale-summary replacements (newer note replaced by older summary)
- Better human trust in consolidation decisions (warnings visible before executing merge)
- LLMs can see why a note was retrieved and whether it should be merged
- No token bloat for callers that do not opt in

## Non-goals

- Not a cross-encoder reranker or neural verification step
- Not adding auto-classification or auto-merge decisions
- Not changing consolidate execution logic (strategies, modes)
- Not adding new storage, ontologies, or relationship types
