---
title: 'Plan: enrich decision points with retrieval rationale and trust signals'
tags:
  - explain
  - consolidate
  - recall
  - design
  - plan
  - evidence
  - workflow-hint
  - tool-descriptions
lifecycle: temporary
createdAt: '2026-04-26T10:11:01.959Z'
updatedAt: '2026-04-26T10:16:15.516Z'
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

## Decision: explainability as capability layer, not workflow step

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

**Core design shift: explainability is a capability layer, not a workflow step.**

The principle "explain before mutate" survives even without a standalone explain command. Evidence should be available at every decision point where memory is about to change, but not as a mandatory step.

## Design constraint: stable abstractions, not raw internals

Do NOT expose raw internal scores that may churn (`coverageScore`, `phraseScore`, `structureScore`, `lexicalScore`, `canonicalExplanationScore`, `connectionDiversity`). Instead surface stable abstractions:

- `channels` (enum) instead of raw rank + score
- `rankBand` ("top3" / "top10" / "lower") instead of raw `semanticRank`
- `projectRelevant` (boolean) instead of `isCurrentProject`
- `freshness` (enum) instead of raw `ageDays` in recall
- `superseded` (boolean) instead of requiring chain traversal

This gives freedom to evolve internals later without contract breaks.

## Phase 1 — Recall retrieval evidence (opt-in)

Add `evidence` parameter to `recall` with values: `undefined` (default off), `"compact"`. When "compact", each result includes a `retrievalEvidence` block.

### Recall evidence shape (stable abstractions)

```typescript
retrievalEvidence?: {
  channels: Array<"semantic" | "lexical" | "graph" | "temporal-boost" | "canonical" | "rescue">;
  rankBand: "top3" | "top10" | "lower";
  projectRelevant: boolean;
  freshness: "today" | "thisWeek" | "thisMonth" | "older";
  superseded: boolean;
  supersededBy?: string;
  supersededCount?: number;
}
```

Recall evidence answers: **Why was this retrieved?**

### Signal source mapping

- `channels`: derived from candidate state (rescue candidates get "rescue", graph-discovered get "graph", temporal-boosted get "temporal-boost", promoted canonical explanations get "canonical")
- `rankBand`: derived from `semanticRank` (1-3 = "top3", 4-10 = "top10", else "lower")
- `projectRelevant`: from `isCurrentProject`
- `freshness`: from `note.updatedAt` banded into human-readable categories
- `superseded`/`supersededBy`/`supersededCount`: from `relatedTo` (type supersedes)

### Plain text format (2-3 lines per result)

```text
top3, lexical | channels: semantic, graph | project-relevant
permanent, decision | thisWeek | supersedes 2 notes
```

### Phase 1 constraints

- Default off — no output change for existing callers
- Fail-soft: if relationship data is unavailable, omit superseded fields
- Token budget: ~2 additional lines per result in text output, ~8 fields in structured output
- No session state required
- Stable abstractions only — no raw internal scores

## Phase 2 — Consolidate enrichment

Enrich detect-duplicates, find-clusters, and suggest-merges output with per-note trust and lineage metadata.

**Consolidation evidence answers a different question than recall**: "Should these merge / prune / supersede?" not "Why was this retrieved?"

### Per-note enrichment in consolidate output

For each note mentioned in strategies:

```text
Note A (0.923) | permanent, decision | 2 days old | supersedes 1 note
Note B (0.891) | temporary, research | 30 days old | no relationships
Note C (0.854) | permanent, context | 5 days old | 3 related notes
```

### Consolidation evidence shape (merge decision payload)

```typescript
mergeEvidence?: {
  lifecycle: "temporary" | "permanent";
  role?: string;
  ageDays: number;           // precise, not enum — consolidation needs exact comparison
  superseded: boolean;
  supersededBy?: string;
  supersededCount?: number;
  relatedCount: number;
  warnings?: string[];
}
```

### Heuristic warnings in suggest-merges

- "temporary research note in merge — consider whether it contains unique evidence"
- "note supersedes another — merging may orphan the supersedes chain"
- "newer note would be merged into older summary — stale summary risk"
- "same role but different lifecycles — verify merge intent"

### Phase 2 constraints

- Always included (not opt-in) — essential at the consolidation decision point
- No additional I/O: lifecycle, role, updatedAt, and relatedTo are already in memory during strategies
- Supersession chain data requires scanning relatedTo (already loaded per entry)
- ageDays computed from updatedAt (no git call needed)

## Phase 2.5 — Workflow hint and tool description updates

The `mnemonic-workflow-hint` prompt and MCP tool descriptions must reflect the new evidence capabilities so LLMs know when and how to use them.

### Workflow hint changes

Add guidance to `mnemonic-workflow-hint`:

- Before consolidate operations, recommend `suggestMerges` or `detectDuplicates` with `evidence: true` to review trust signals before deciding
- Before pruning, recommend reviewing supersession chains and merge warnings
- When recall results seem ambiguous, recommend `evidence: "compact"` to understand why results ranked as they did
- Frame evidence as optional enrichment for decision confidence, not a mandatory step

### Tool description changes

Update descriptions for affected tools:

- **recall**: Document the `evidence` parameter (default off, "compact" for retrieval rationale inline)
- **detectDuplicates**: Document the `evidence` parameter (default off, true for per-note trust metadata)
- **suggestMerges**: Document the `evidence` parameter and the merge warnings it produces
- **consolidate** (dry-run): Document that `evidence: true` enriches the dry-run preview with per-note lineage, freshness, and warnings

### Documentation design principle

Evidence parameters are **opt-in discoverability**: the documentation should make LLMs aware the capability exists, but never frame it as a required step. The workflow hint should say "use evidence when you need confidence in a merge or prune decision" not "always run evidence before consolidate".

This keeps the capability layer approach consistent: explainability is available at every decision point, but mandatory only when the caller assesses uncertainty.

## Phase 3 — Get enrichment (opt-in, lower priority)

Add `evidence: boolean` to `get`. When true, include supersededBy, supersedes chain, and relationship health metadata for individual note inspection.

Lower priority since get already returns full relationships and the primary gap is at recall and consolidate decision points.

## Mapping to original proposal

- `mnemonic explain --last-recall` becomes `recall(evidence: "compact")` — atomic, no session state
- `mnemonic explain "query text"` becomes `recall` with `evidence: "compact"`
- `mnemonic explain note-id` becomes `get` with `evidence: true` (Phase 3)
- Separate reasoning artifact becomes enriched output at existing decision points
- New storage for explain results becomes no new storage — signals are computed in-memory

## Success criteria

- Fewer accidental bad merges (temporary research merged into permanent decisions)
- Fewer stale-summary replacements (newer note replaced by older summary)
- Better human trust in consolidation decisions (warnings visible before executing merge)
- LLMs can see why a note was retrieved and whether it should be merged
- No token bloat for callers that do not opt in
- Stable abstraction surface preserves implementation freedom

## Non-goals

- Not a cross-encoder reranker or neural verification step
- Not adding auto-classification or auto-merge decisions
- Not changing consolidate execution logic (strategies, modes)
- Not adding new storage, ontologies, or relationship types
- Not a mandatory workflow step — evidence is opt-in discoverability
