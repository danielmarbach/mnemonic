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
updatedAt: '2026-04-26T19:01:43.773Z'
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
memoryVersion: 1
---
# Decision: expose trust evidence at decision points via opt-in enrichment

Use capability-level evidence on existing tools instead of introducing a separate explain workflow step.

## Decision

- `recall` exposes retrieval rationale via `evidence: "compact"`.
- `consolidate` analysis strategies (`detect-duplicates`, `suggest-merges`, `dry-run`) expose trust/risk rationale via `evidence: true`.
- Evidence stays compact and optional, preserving default output behavior and token budget.

## Rationale

- Ranking and lineage signals already exist in pipeline state and can be serialized safely at the output boundary.
- Decision quality improves when merge/retrieval context includes freshness, supersession, role/lifecycle mismatch, and coarse merge risk.
- Opt-in enrichment avoids turning mnemonic into an orchestration runtime while improving confidence at mutation decision points.

## Consequences

- Structured schemas now carry retrieval/consolidation evidence payloads.
- Tool descriptions and workflow hints document optional evidence usage for uncertainty-driven decisions.
- Future phases can extend this pattern (e.g., targeted `get` enrichment) without breaking callers.
