---
title: 'Research: consolidate evidence defaults and execute-merge safety gap'
tags:
  - consolidate
  - evidence
  - execute-merge
lifecycle: temporary
createdAt: '2026-04-28T10:32:15.261Z'
updatedAt: '2026-04-28T10:32:22.718Z'
role: research
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: request-make-consolidate-evidence-always-on-and-add-to-execu-37ae2225
    type: derives-from
  - id: decision-expose-trust-evidence-at-decision-points-via-opt-in-244d8317
    type: derives-from
memoryVersion: 1
---
# Research: consolidate evidence defaults and execute-merge safety gap

## Question

Was it a good idea to make consolidate evidence optional (default `false`)? Should `execute-merge` also surface trust signals?

## Current state (code review)

### Analysis strategies

- `detect-duplicates(evidence: boolean)` — called with `evidence` param, default `false`
- `suggestMerges(evidence: boolean)` — same pattern
- `dryRunAll` propagates the same param
- `findClusters` — no evidence support at all
- Input schema: `z.boolean().optional()` for evidence param

### execute-merge

- Function signature: no evidence parameter
- Output: text lines showing consolidation result (mode, notes stored, persistence)
- No lifecycle/risk/warnings inline

### Token budget analysis

Consolidation deals with small result sets (pairs or ~5-20 notes max). Evidence adds ~2 lines per note. Compare to recall where 20 results × 3 lines each = 60 lines — recall is where token discipline matters. Consolidation evidence is negligible.

### Risk analysis: what can go wrong without evidence

1. LLM merges temporary research note into permanent decision → contaminates durable memory with work-in-progress content
2. LLM merges newer note into older summary → replaces fresh content with stale summary
3. LLM orphans supersedes chain → lose lineage between old and current content
4. LLM merges notes with same role but different lifecycles without verifying intent

All four are preventable with evidence warnings.

## Decision

Approved by user. Two changes:

1. Flip default `evidence: false` → `true` for analysis strategies
2. Add evidence to `execute-merge` as inline text trust signals
