---
title: 'Decision: expose trust evidence at decision points via opt-in enrichment'
tags:
  - decision
  - evidence
  - recall
  - consolidate
  - workflow
lifecycle: permanent
createdAt: '2026-04-26T19:00:03.668Z'
updatedAt: '2026-04-28T10:39:56.951Z'
role: decision
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: plan-enrich-decision-points-with-retrieval-rationale-and-tru-0dd24e70
    type: derives-from
  - id: summary-evidence-enrichment-implementation-across-recall-and-10b7ba37
    type: follows
  - id: request-implement-evidence-enrichment-phases-from-explainabi-abe55a21
    type: derives-from
  - id: reference-rpir-evidence-enrichment-delivery-pattern-for-mnem-4a852278
    type: derives-from
  - id: research-consolidate-evidence-defaults-and-execute-merge-saf-8560d01e
    type: derives-from
memoryVersion: 1
---
# Decision: expose trust evidence at decision points via opt-in enrichment

Use capability-level evidence on existing tools instead of introducing a separate explain workflow step.

## Decision

- `recall` exposes retrieval rationale via `evidence: "compact"` (opt-in).
- `consolidate` analysis strategies (`detect-duplicates`, `suggest-merges`, `dry-run`) expose trust/risk rationale via `evidence: true`.
- Consolidate evidence now defaults on for safety (analysis strategies and `execute-merge`). Recall evidence remains opt-in.
- Token cost of consolidation evidence is negligible. Risk of bad merges without evidence (lifecycle contamination, orphaned supersedes chains, stale summary replacement) outweighs token savings.

## Rationale

- Ranking and lineage signals already exist in pipeline state and can be serialized safely at the output boundary.
- Decision quality improves when merge/retrieval context includes freshness, supersession, role/lifecycle mismatch, and coarse merge risk.
- Consolidation deals with small result sets; recall deals with up to 20 results — different token budgets.

## Consequences

- Structured schemas carry retrieval/consolidation evidence payloads.
- Consolidate analysis and execute-merge default evidence on; recall remains opt-in.
- Future phases can extend this pattern (e.g., targeted `get` enrichment) without breaking callers.
