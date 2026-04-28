---
title: 'Research: explain before consolidate — value assessment and design analysis'
tags:
  - explain
  - consolidate
  - recall
  - design
  - research
lifecycle: temporary
createdAt: '2026-04-26T10:07:45.462Z'
updatedAt: '2026-04-26T10:14:43.416Z'
role: research
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mnemonic-key-design-decisions-3f2a6273
    type: derives-from
  - id: hybrid-recall-design-and-implementation-0-20-0-0-23-0-350317a0
    type: derives-from
  - id: consolidate-tool-design-execute-merge-behavior-idempotency-a-0911e2cd
    type: derives-from
  - id: mcp-workflow-ux-hint-prompt-tool-descriptions-and-session-st-e89a18fc
    type: derives-from
memoryVersion: 1
---
# Research: explain before consolidate — value assessment and design analysis

## Research question

Should mnemonic introduce an `explain` tool (or explain enrichment) that surfaces retrieval rationale, lineage, and trust signals before memory-changing operations like `consolidate`, `supersede`, or `prune`?

The proposal argues: "Do not let LLMs mutate memory from text alone. Let them mutate memory from text + ranking evidence + lineage + freshness + trust signals."

## Signal inventory

### Retrieval signals computed but not surfaced

`ScoredRecallCandidate` in `recall.ts` computes signals never exposed to the LLM: `semanticRank`, `lexicalRank`, `lexicalScore`, `coverageScore`, `phraseScore`, `canonicalExplanationScore`, `relatedCount`, `connectionDiversity`, `structureScore`, `isCurrentProject`, graph spreading source, rescue candidate flag, temporal boost amount, and `metadata` (partially exposed — role only).

### Signals already exposed in recall output

`score`, `boosted`, `provenance` (lastUpdatedAt, lastCommitHash, recentlyChanged), `confidence` (high/medium/low), `lifecycle`, `role`, `tags`, bounded 1-hop relationship previews (top N), `history`/`historySummary` (temporal mode only).

### Key gap in consolidate strategies

`detect-duplicates` and `suggest-merges` compute pairwise cosine similarity in isolation — no recall pipeline signals, no per-note lineage, freshness, or supersession chain information.

## Design principle analysis

### Principles supporting enrichment over a new tool

1. **No new storage** — all signals already exist in memory during recall. File-first, no-new-artifacts.
2. **Additive, bounded, reversible** — surfacing existing signals mirrors how temporal recall was added.
3. **Fail-soft** — partial signals degrade gracefully, exactly like lexical rescue.
4. **Token efficiency** — the strongest argument against a separate explain tool.
5. **Stable abstractions over raw internals** — expose bands, booleans, enums, not raw scores that may churn.

### Principles challenging a separate explain tool

1. **Store, not runtime** — `explain` as a step risks making mnemonic a reasoning engine. Mnemonic provides artifacts; the LLM reasons over them.
2. **Workflow guidance in prompts/skills, not mandatory tool sequences** — adding `explain` before consolidate contradicts this.
3. **Token budget discipline** — recall already limits previews. An explain dump for every candidate blows past budgets.
4. **Consolidate uses its own similarity** — recall weighting (project boost, canonical promotion, graph spreading) doesn't apply to pairwise similarity.
5. **Different decision points answer different questions** — recall asks "why retrieved?", consolidate asks "should merge?". One explain payload doesn't fit both.

## Stakeholder refinements incorporated

Three key refinements from the proposal author's review:

### 1. Do not expose raw internal scores too early

Avoid leaking unstable internals (`coverageScore`, `phraseScore`, `structureScore`, `lexicalScore` — these may churn). Instead expose stable abstractions:

- `channels` (enum) instead of raw rank + score
- `rankBand` ("top3" / "top10" / "lower") instead of raw `semanticRank`
- `projectRelevant` (boolean) instead of `isCurrentProject`
- `freshness` (enum) instead of raw `ageDays` in recall
- `superseded` (boolean) instead of requiring chain traversal

This gives freedom to evolve internals later without contract breaks.

### 2. Compact by default

Default `evidence` mode is `"compact"` (opt-in, not default). Verbose mode only when requested. Follows the pattern of `mode: "temporal"` and `verbose: true`.

### 3. Consolidation gets different evidence than recall

Recall evidence answers: **Why was this retrieved?**

Consolidation evidence answers: **Should these merge / prune / supersede?**

Different question, different payload:

- Recall: channels, rankBand, projectRelevant, freshness enum, superseded boolean
- Consolidation: lifecycle, role, ageDays (precise for comparison), supersession chain, relatedCount, merge-specific warnings

## Recommended approach: explainability as capability layer

**The core design shift: explainability is not a workflow step, it is a capability layer.**

The principle "explain before mutate" survives even without a standalone command. Evidence should be available at every decision point where memory is about to change.

Surface points:

- `recall(evidence: "compact")` — compact retrieval rationale inline in recall results
- `detectDuplicates(evidence: true)` — per-note trust metadata alongside similarity
- `suggestMerges(evidence: true)` — per-note trust + merge warnings alongside suggestions
- `consolidate(dryRun: true, evidence: true)` — full evidence at the preview stage

No standalone `explain` tool initially. Only add an explicit explain command later if real workflows demand it.

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

### Consolidation evidence shape (merge decision payload)

```typescript
mergeEvidence?: {
  lifecycle: "temporary" | "permanent";
  role?: string;
  ageDays: number;
  superseded: boolean;
  supersededBy?: string;
  supersededCount?: number;
  relatedCount: number;
  warnings?: string[];
}
```

### Heuristic warnings for suggest-merges

- "temporary research note in merge — consider unique evidence"
- "note supersedes another — merging may orphan the supersedes chain"
- "newer note would be merged into older summary — stale summary risk"
- "same role but different lifecycles — verify merge intent"

### Implementation path

1. Phase 1: Add `evidence: "compact"` to recall (stable abstractions, opt-in, default off)
2. Phase 2: Add `evidence: true` to consolidate strategies (merge-specific payload, always-on for suggest-merges and detect-duplicates)
3. Phase 3: Use evidence fields in workflow prompts and skills
4. Phase 4 (only if real workflows demand it): Consider standalone explain command
