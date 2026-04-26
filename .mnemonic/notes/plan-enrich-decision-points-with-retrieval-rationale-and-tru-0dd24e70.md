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
  - token-efficiency
lifecycle: temporary
createdAt: '2026-04-26T10:11:01.959Z'
updatedAt: '2026-04-26T18:59:39.381Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: research-explain-before-consolidate-value-assessment-and-des-f1b237dc
    type: derives-from
  - id: rpir-workflow-design-for-mnemonic-research-plan-implement-re-80b00851
    type: follows
  - id: apply-implement-evidence-enrichment-phases-1-2-and-2-5-f18137eb
    type: follows
  - id: request-implement-evidence-enrichment-phases-from-explainabi-abe55a21
    type: derives-from
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

## Token efficiency constraints (from established design principles)

The evidence feature must adhere to mnemonic's existing token efficiency constraints:

1. **Compact by default, enriched on demand** — evidence defaults off. When enabled, `"compact"` adds ~2 lines per result, not a full provenance dump. Follows the established pattern: `mode: "temporal"` is opt-in enrichment, `verbose: true` is richer but still bounded, `includeRelationships` is bounded to top N.

2. **Serialization boundary, not pipeline boundary** — evidence signals are computed during the normal pipeline (they already exist in `ScoredRecallCandidate` and during consolidate entry iteration). The `evidence` flag controls what reaches the caller, not what the pipeline computes. This mirrors the verbose/temporal design: enrich fully in the pipeline, filter at the output layer.

3. **No raw note bodies or verbose diagnostics in evidence** — `retrievalEvidence` contains structured enums and booleans (channels, rankBand, freshness, superseded), not raw scores, not note content, not full relationship graphs. `mergeEvidence` contains compact per-note fields (lifecycle, role, ageDays, relatedCount), not full note bodies.

4. **Bounded enrichment, not unbounded expansion** — recall limits relationship previews to top N (1-3). Consolidate strategies iterate all entries but output is already bounded by the strategy. Evidence adds ~8 fields per entry in structured output and ~2 lines per entry in text output. Total evidence output is additive to existing output, not multiplicative.

5. **Different tools get different payload shapes** — recall evidence answers "why retrieved?" with stable abstraction enums. Consolidate evidence answers "should merge?" with precise comparison fields (ageDays, not freshness enum). One payload shape does not fit both decision points.

6. **Structured output carries the full detail; text output carries the summary** — this matches how recall already works: `structuredContent` has `provenance`, `confidence`, `historySummary` while text output has `**confidence: medium** | **recently changed**`. Evidence follows the same pattern.

7. **Opt-in discoverability, not mandatory step** — the workflow hint documents `evidence` as a capability that improves decision confidence, not as a required precondition. This matches how `mode: "temporal"` and `includeRelationships` are documented: available when you need them, not needed every time.

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

### Phase 1 token budget

Per result in text: ~2 additional lines. Per result in structured: ~8 fields.

Typical 5-result recall: ~10 additional text lines, ~40 structured fields.
Maximum 20-result recall: ~40 additional text lines, ~160 structured fields.

Comparable to `mode: "temporal"` enrichment which adds ~3-5 lines per top-3 result (~9-15 total lines). Evidence is within this envelope.

### Phase 1 constraints

- Default off — no output change for existing callers
- Fail-soft: if relationship data is unavailable, omit superseded fields
- No session state required
- Stable abstractions only — no raw internal scores
- Enrich in the pipeline, serialize at the output boundary

## Phase 2 — Consolidate enrichment

Enrich detect-duplicates, find-clusters, and suggest-merges output with per-note trust and lineage metadata.

**Consolidation evidence answers a different question than recall**: "Should these merge / prune / supersede?" not "Why was this retrieved?"

### Per-note enrichment in consolidate output

```text
Note A (0.923) | permanent, decision | 2 days old | supersedes 1 note | risk: low
Note B (0.891) | temporary, research | 30 days old | no relationships | risk: medium
Note C (0.854) | permanent, context | 5 days old | 3 related notes | risk: high
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
  mergeRisk: "low" | "medium" | "high";  // coarse triage derived from warnings
  warnings?: string[];
}
```

### Heuristic warnings in suggest-merges

- "temporary research note in merge — consider whether it contains unique evidence"
- "note supersedes another — merging may orphan the supersedes chain"
- "newer note would be merged into older summary — stale summary risk"
- "same role but different lifecycles — verify merge intent"

### Phase 2 token budget

Per note: ~1 additional text line, ~5-8 structured fields.
Typical 5-20 note pairs: ~5-20 additional text lines, ~25-160 structured fields.

Comparable to existing `suggest-merges` output which already shows similarity and source titles per note. Evidence adds compact fields, not prose.

### Phase 2 constraints

- Always included (not opt-in) — essential at the consolidation decision point
- No additional I/O: lifecycle, role, updatedAt, and relatedTo are already in memory during strategies
- Supersession chain data requires scanning relatedTo (already loaded per entry)
- ageDays computed from updatedAt (no git call needed)
- `mergeRisk` derivation: 0 warnings → "low", 1 non-critical → "medium", 2+ or any critical (supersession chain, lifecycle mismatch) → "high"

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
- Evidence output stays within the token envelope established by mode: "temporal" and includeRelationships

## Non-goals

- Not a cross-encoder reranker or neural verification step
- Not adding auto-classification or auto-merge decisions
- Not changing consolidate execution logic (strategies, modes)
- Not adding new storage, ontologies, or relationship types
- Not a mandatory workflow step — evidence is opt-in discoverability

## Status update

- Completed: Phase 1 (recall evidence), Phase 2 (consolidate evidence + warnings/risk), and Phase 2.5 (workflow/tool discoverability updates).
- Validation completed with targeted typecheck/build/tests and review note evidence.
- Scope note: consolidate evidence shipped as opt-in (`evidence: true`) for analysis strategies to preserve default compact output while still enabling trust enrichment on demand.
- Next RPIR phase: Consolidate durable outcomes (promote decision/summary notes, keep apply/review as temporary scaffolding).
