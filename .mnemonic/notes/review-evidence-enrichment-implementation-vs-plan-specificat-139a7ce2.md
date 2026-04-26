---
title: 'Review: evidence enrichment implementation vs plan specification'
tags:
  - workflow
  - review
  - evidence
  - recall
  - consolidate
lifecycle: temporary
createdAt: '2026-04-26T19:16:53.530Z'
updatedAt: '2026-04-26T19:16:53.530Z'
role: review
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
# Review: evidence enrichment implementation vs plan specification

**Outcome: Continue with minor findings -- no blockers.**

## Review method

Systematic comparison of the explain branch implementation against the plan in plan-enrich-decision-points-with-retrieval-rationale-and-tru, covering Phase 1 (recall evidence), Phase 2 (consolidate evidence + warnings/risk), and Phase 2.5 (workflow hint + tool descriptions).

## Phase 1 -- Recall retrieval evidence

All spec items match:

- evidence parameter: z.enum(["compact"]).optional() -- matches plan (default off, "compact" for opt-in)
- RetrievalEvidence shape: all fields present (channels, rankBand, projectRelevant, freshness, superseded, supersededBy?, supersededCount?)
- Channel enum values: semantic, lexical, graph, temporal-boost, canonical, rescue -- all present
- rankBand mapping: toRecallRankBand() 1-3=top3, 4-10=top10, else=lower -- matches
- freshness mapping: toRecallFreshness() today/thisWeek/thisMonth/older -- matches
- Default off: retrievalEvidence is undefined when evidence !== "compact" -- matches
- Stable abstractions only: no raw internal scores exposed -- matches
- Text format: formatRetrievalEvidenceHint() produces 2 lines -- within budget

**Finding 1 (minor): supersededBy is not populated in recall evidence.** The plan specifies supersededBy?: string but the recall runtime (index.ts:2827-2841) omits it. The Zod schema and interface include the field as optional. Consolidate implements it (via buildSupersededByMap), but recall does not compute it. Low severity -- the schema supports it, fail-soft behavior is defensible.

## Phase 2 -- Consolidate enrichment

- ConsolidateNoteEvidence: all plan fields present + beneficial additions (id, title)
- All four heuristic warnings: verbatim matches
- deriveMergeRisk(): 0 warnings=low, 1 non-critical=medium, 2+ or critical=high -- matches
- detect-duplicates evidence: implemented with evidence boolean gate
- suggest-merges evidence: implemented with evidence boolean gate
- dry-run threading: dryRunAll passes evidence to both strategies
- find-clusters: no evidence enrichment (correct omission -- not in plan)

**Finding 2 (intentional scope deviation): Consolidate evidence is opt-in, not always-on.** Plan originally said always included, but implementation uses evidence: boolean (default false). The plan status update explicitly documents this change. Acceptable -- preserves token efficiency and pattern consistency.

## Phase 2.5 -- Workflow hint and tool descriptions

- Workflow hint: frames evidence as optional confidence aid -- matches
- recall tool description: documents evidence: "compact" parameter -- matches
- consolidate tool description: documents evidence: true for analysis strategies -- matches
- Opt-in discoverability: both descriptions use "Optional" / "when you need" -- matches

## Token efficiency and design constraints

All seven constraints satisfied: compact by default, serialization boundary, no raw scores, bounded enrichment, different payload shapes, structured carries detail / text carries summary, opt-in discoverability.

## Test coverage

- consolidate.unit.test.ts: buildMergeWarnings, deriveMergeRisk, buildConsolidateNoteEvidence -- good unit coverage
- recall-embeddings.integration.test.ts: default off, compact on, structured schema, text rendering -- good integration
- sync-migrations.integration.test.ts: E2E consolidate evidence with detect-duplicates + suggest-merges -- good
- tool-descriptions.integration.test.ts: prompt has "evidence enrichment", recall has evidence param, consolidate has evidence param -- discoverability verified

## Verification evidence

- Command: rtk vitest (targeted tests)
- Result: PASS (54), FAIL (0)

## Summary

Two documented findings, neither blocking:

1. supersededBy not populated in recall -- low severity, schema supports future addition
2. Consolidate evidence opt-in instead of always-on -- intentional, documented in plan update
