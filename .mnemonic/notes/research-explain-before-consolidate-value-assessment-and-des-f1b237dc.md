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
updatedAt: '2026-04-26T10:08:01.283Z'
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
memoryVersion: 1
---
# Research: explain before consolidate — value assessment and design analysis

## Research question

Should mnemonic introduce an `explain` tool (or explain enrichment) that surfaces retrieval rationale, lineage, and trust signals before memory-changing operations like `consolidate`, `supersede`, or `prune`?

The proposal argues: "Do not let LLMs mutate memory from text alone. Let them mutate memory from text + ranking evidence + lineage + freshness + trust signals."

## What mnemonic already has (signal inventory)

### Retrieval signals already computed but not surfaced

The `ScoredRecallCandidate` interface in `recall.ts` already computes a rich set of signals per candidate that are **never exposed to the LLM**:

- `semanticRank` — not exposed
- `lexicalRank` — not exposed
- `lexicalScore` — not exposed
- `coverageScore` — not exposed
- `phraseScore` — not exposed
- `canonicalExplanationScore` — not exposed
- `relatedCount` — not exposed
- `connectionDiversity` — not exposed
- `structureScore` — not exposed
- `isCurrentProject` — not exposed
- Graph spreading source — not exposed
- Was rescue candidate — not exposed
- Temporal boost amount — not exposed
- `metadata` (role, importance, alwaysLoad) — partially exposed (role only)

### Signals already exposed in recall output

- `score` and `boosted` numbers
- `provenance` (lastUpdatedAt, lastCommitHash, recentlyChanged)
- `confidence` (high/medium/low)
- `lifecycle` and `role`
- `tags`
- Bounded 1-hop relationship previews (top N results only)
- `history` and `historySummary` (temporal mode only)

### Key gap in consolidate strategies

`detect-duplicates` and `suggest-merges` compute pairwise cosine similarity in isolation. They do not have access to the recall pipeline's rich signal stack (lexical scores, canonical explanation scores, graph spreading, temporal signals, project boost). They also lack per-note lineage, freshness, and supersession chain information.

## Design principle analysis

### Principles that support enriching existing tools over adding a new one

1. **No new storage** — all signals already exist in memory during recall. Aligns with file-first, no-new-artifacts.
2. **Additive, bounded, reversible** — surfacing existing signals is purely additive. Mirrors how temporal recall was added.
3. **Fail-soft** — partial signals degrade gracefully, exactly like lexical rescue.
4. **Token efficiency** — this is the strongest argument against a separate `explain` tool.

### Principles that challenge a separate `explain` tool

1. **Mnemonic is the canonical store, not the workflow runtime** — `explain` as a separate step risks turning mnemonic into a reasoning engine. Established principle: mnemonic provides artifacts; the LLM reasons over them.
2. **Workflow guidance lives in prompts/skills, not mandatory tool sequences** — adding `explain` before consolidate contradicts this.
3. **Token budget discipline** — recall already limits relationship previews. An `explain` dump for every candidate would blow past budgets.
4. **Consolidate uses its own similarity computation** — recall signals use different weighting (project boost, canonical promotion, graph spreading) not applicable to pairwise similarity.

## Recommended approach: enrich at decision points, no new tool

### Enrich recall output (opt-in)

Add compact `retrievalEvidence` to recall results via an opt-in parameter (like `mode: "temporal"`). Per-result compact format:

```typescript
retrievalEvidence?: {
  semanticRank: number;
  lexicalRank?: number;
  channels: ("semantic" | "lexical-rescue" | "graph-spreading" | "temporal-boost")[];
  canonicalExplanationScore?: number;
  isCurrentProject: boolean;
  supersededBy?: string;
  supersededCount?: number;
  ageDays: number;
}
```

### Enrich consolidate strategies

Enhance `suggest-merges` and `detect-duplicates` to include per-note trust and lineage metadata:

- lifecycle and role (already available)
- freshness: updatedAt age in days
- supersession status: is this note already superseded? does it supersed others?
- relationship count: how connected is this note?
- conflict warnings: temporary research vs permanent decision in same merge suggestion

### No new `explain` tool needed

The proposal's core insight is correct: LLMs should not mutate memory from text alone when richer signals exist. But the right shape is enriching the existing decision points (recall, consolidate), not adding a separate reasoning step.

**Implementation path:**

1. Add `retrievalEvidence` to recall results (opt-in parameter)
2. Enrich `suggest-merges` and `detect-duplicates` with per-note lineage, freshness, and trust metadata
3. Add `supersededBy` / `supersededCount` to both recall and consolidate output
4. No new tool required

This preserves the "store, not runtime" principle, avoids session state, keeps token budgets tight, and follows established opt-in enrichment patterns.
