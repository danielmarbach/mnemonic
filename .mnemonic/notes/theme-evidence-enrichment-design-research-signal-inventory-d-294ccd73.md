---
title: >-
  Theme: Evidence enrichment design research — signal inventory, design
  principles, and stakeholder refinements
tags:
  - evidence
  - design
  - research
  - theme
  - consolidate
  - recall
lifecycle: permanent
createdAt: '2026-04-28T15:58:21.379Z'
updatedAt: '2026-04-28T16:02:26.570Z'
role: reference
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
# Theme: Evidence enrichment design research — signal inventory, design principles, and stakeholder refinements

This note preserves the design analysis and rationale that informed the evidence enrichment implementation (phases 1-2.5). The decision and summary notes capture *what was built*; this captures *why it was designed that way*.

## Research question

Should mnemonic introduce an `explain` tool (or explain enrichment) that surfaces retrieval rationale, lineage, and trust signals before memory-changing operations like `consolidate`, `supersede`, or `prune`?

The proposal argued: "Do not let LLMs mutate memory from text alone. Let them mutate memory from text + ranking evidence + lineage + freshness + trust signals."

## Signal inventory (what exists but was not surfaced)

`ScoredRecallCandidate` in `recall.ts` computes: `semanticRank`, `lexicalRank`, `lexicalScore`, `coverageScore`, `phraseScore`, `canonicalExplanationScore`, `relatedCount`, `connectionDiversity`, `structureScore`, `isCurrentProject`, graph spreading source, rescue candidate flag, temporal boost amount, and `metadata` (role only partially exposed).

Signals *already* exposed: `score`, `boosted`, `provenance` (lastUpdatedAt, lastCommitHash, recentlyChanged), `confidence` (high/medium/low), `lifecycle`, `role`, `tags`, bounded 1-hop relationship previews, `history`/`historySummary` (temporal mode only).

Key gap in consolidate strategies: `detect-duplicates` and `suggest-merges` computed pairwise cosine similarity in isolation — no recall pipeline signals, no per-note lineage, freshness, or supersession chain information.

## Design principle analysis

### Principles supporting enrichment over a new tool

1. **No new storage** — all signals exist in memory during recall
2. **Additive, bounded, reversible** — mirrors how temporal recall was added
3. **Fail-soft** — partial signals degrade gracefully
4. **Token efficiency** — strongest argument against a separate explain tool
5. **Stable abstractions over raw internals** — expose bands, booleans, enums, not raw scores

### Principles challenging a separate explain tool

1. **Store, not runtime** — mnemonic provides artifacts; the LLM reasons over them
2. **Workflow guidance in prompts/skills, not mandatory tool sequences**
3. **Token budget discipline** — recall already limits previews
4. **Consolidate uses its own similarity** — recall weighting doesn't apply to pairwise similarity
5. **Different decision points answer different questions** — recall asks "why retrieved?", consolidate asks "should merge?"

### Stakeholder refinements

1. **Stable abstractions, not raw internals**: Surface `channels` (enum) not raw rank; `rankBand` ("top3"/"top10"/"lower") not raw `semanticRank`; `projectRelevant` (boolean); `freshness` (enum); `superseded` (boolean). This gives freedom to evolve internals later without contract breaks.

2. **Compact by default**: Default evidence mode is `"compact"` (opt-in). Follows the established pattern of `mode: "temporal"` and `verbose: true`.

3. **Different evidence for consolidation than recall**: Recall evidence answers "Why was this retrieved?" (channels, rankBand, projectRelevant, freshness). Consolidation evidence answers "Should these merge?" (lifecycle, role, ageDays, supersession chain, relatedCount, merge warnings).

## Consolidation evidence defaults flip rationale

The original opt-in design was correct in principle (token discipline) but wrong for the consolidation domain:

- Consolidation deals with small result sets — evidence is cheap (~2 lines per note)
- Risk of bad merges without lifecycle/risk context is real and preventable
- Four concrete scenarios prevented by evidence:
  1. LLM merges temporary research note into permanent decision → contaminates durable memory
  2. LLM merges newer note into older summary → replaces fresh content with stale summary
  3. LLM orphans supersedes chain → lose lineage between old and current content
  4. LLM merges notes with same role but different lifecycles without verifying intent

Per-note risk accuracy fix: original group-level `buildMergeWarnings` passed identical warnings to every note's `deriveMergeRisk`, causing all notes in non-trivial groups to get `risk:high`. Fixed with per-note `buildNoteWarnings` and `aggregateMergeRisk` (max per-note risk).

### Risk calibration

- Critical warnings (supersedes chain, stale summary) → "high"
- Single non-critical warning → "medium"
- 2+ non-critical warnings → "high"

### Warning specificity

- Group warnings prefixed with originating note title for actionability
- Per-note warnings tell you which specific note is risky

## Core design shift: explainability as capability layer, not workflow step

The principle "explain before mutate" survives even without a standalone command. Evidence should be available at every decision point where memory is about to change, but not as a mandatory step.

Surface points:

- `recall(evidence: "compact")` — compact retrieval rationale inline
- `detectDuplicates(evidence: true)` — per-note trust metadata alongside similarity
- `suggestMerges(evidence: true)` — per-note trust + merge warnings
- `consolidate(dryRun: true, evidence: true)` — full evidence at preview stage

No standalone `explain` tool. Only add one later if real workflows demand it.

## Token efficiency constraints

- Compact by default, enriched on demand (~2 lines per result)
- Serialization boundary, not pipeline boundary — enrich in pipeline, filter at output
- No raw note bodies or verbose diagnostics in evidence
- Bounded enrichment — evidence adds ~8 fields per entry in structured, ~2 lines in text
- Different tools get different payload shapes
- Structured output carries full detail; text output carries summary
- Opt-in discoverability, not mandatory step

## Evidence shapes

### Recall evidence (stable abstractions)

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

### Consolidation evidence (merge decision payload)

```typescript
mergeEvidence?: {
  lifecycle: "temporary" | "permanent";
  role?: string;
  ageDays: number;
  superseded: boolean;
  supersededBy?: string;
  supersededCount?: number;
  relatedCount: number;
  mergeRisk: "low" | "medium" | "high";
  warnings?: string[];
}
```

### Heuristic warnings for suggest-merges

- "temporary research note in merge — consider unique evidence"
- "note supersedes another — merging may orphan the supersedes chain"
- "newer note would be merged into older summary — stale summary risk"
- "same role but different lifecycles — verify merge intent"

## Consolidation evidence defaults flip rationale

The original opt-in design was correct in principle (token discipline) but wrong for consolidation:

- Consolidation deals with small result sets — evidence is cheap
- Risk of bad merges without lifecycle/risk context is real and preventable
- Per-note risk accuracy: original group-level `buildMergeWarnings` passed identical warnings to every note's `deriveMergeRisk`, causing all notes in non-trivial groups to get `risk:high`
- Fix: per-note `buildNoteWarnings` and `aggregateMergeRisk` (max per-note risk)

## Derived artifacts

- Decision note: `decision-expose-trust-evidence-at-decision-points-via-opt-in-244d8317`
- Summary notes: `summary-evidence-enrichment-implementation-across-recall-and-10b7ba37`, `summary-consolidate-evidence-always-on-and-execute-merge-evi-544d3ee8`
- Dogfood findings: `dogfood-findings-consolidation-evidence-metadata-alone-insuf-7278ec64`
