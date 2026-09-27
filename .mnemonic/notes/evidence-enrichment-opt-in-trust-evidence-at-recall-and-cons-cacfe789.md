---
title: >-
  Evidence enrichment: opt-in trust evidence at recall and consolidate decision
  points
tags:
  - decision
  - evidence
  - recall
  - consolidate
  - workflow
  - summary
  - verification
lifecycle: permanent
createdAt: '2026-09-27T20:54:36.312Z'
updatedAt: '2026-09-27T20:54:36.312Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: request-implement-evidence-enrichment-phases-from-explainabi-abe55a21
    type: derives-from
  - id: reference-rpir-evidence-enrichment-delivery-pattern-for-mnem-4a852278
    type: derives-from
  - id: research-consolidate-evidence-defaults-and-execute-merge-saf-8560d01e
    type: derives-from
  - id: dogfood-findings-consolidation-evidence-metadata-alone-insuf-7278ec64
    type: derives-from
  - id: theme-evidence-enrichment-design-research-signal-inventory-d-294ccd73
    type: explains
  - id: theme-consolidation-evidence-discriminative-power-fix-proble-aa49ac2a
    type: explains
  - id: theme-evidence-enrichment-design-research-signal-inventory-d-294ccd73
    type: derives-from
  - id: reference-rpir-evidence-enrichment-delivery-pattern-for-mnem-4a852278
    type: follows
  - id: enriched-confidence-scoring-with-signal-strength-composite-i-06563116
    type: derives-from
  - id: retrieval-precision-and-diversity-diagnostics-implemented-763c1459
    type: related-to
memoryVersion: 1
---
## Consolidated from:
### Decision: expose trust evidence at decision points via opt-in enrichment
*Source: `decision-expose-trust-evidence-at-decision-points-via-opt-in-244d8317`*

# Decision: expose trust evidence at decision points via opt-in enrichment

Use capability-level evidence on existing tools instead of introducing a separate explain workflow step.

## Decision

- `recall` exposes retrieval rationale via `evidence: "compact"` (opt-in).
- `consolidate` analysis strategies (`detect-duplicates`, `suggest-merges`, `dry-run`) expose trust/risk rationale via `evidence: true`.
- Consolidate evidence now defaults on for safety (analysis strategies and `execute-merge`). Recall evidence remains opt-in.
- Token cost of consolidation evidence is negligible. Risk of bad merges without evidence (lifecycle contamination, orphaned supersedes chains, stale summary replacement) outweighs token savings.
- Per-note warnings: `buildNoteWarnings(note, allNotes, targetNote?)` returns note-specific warnings instead of group-level `buildMergeWarnings`.
- Per-note risk: `buildConsolidateNoteEvidence` derives risk from note-specific warnings, not group-level warnings.
- Group risk: `aggregateMergeRisk` computes max per-note risk instead of count-based threshold.
- `deriveMergeRisk` calibrated: critical warnings (supersedes chain, stale summary) → "high"; non-critical → "medium" (single) or "high" (2+).

## Rationale

- Ranking and lineage signals already exist in pipeline state and can be serialized safely at the output boundary.
- Decision quality improves when merge/retrieval context includes freshness, supersession, role/lifecycle mismatch, and coarse merge risk.
- Consolidation deals with small result sets; recall deals with up to 20 results — different token budgets.
- Per-note risk accuracy: the original group-level `buildMergeWarnings` passed identical warnings to every note's `deriveMergeRisk`, causing all notes in non-trivial groups to get `risk:high`. The fix replaces this with per-note `buildNoteWarnings` and `aggregateMergeRisk` (max per-note risk).

## Consequences

- Structured schemas carry retrieval/consolidation evidence payloads.
- Consolidate analysis and execute-merge default evidence on; recall remains opt-in.
- Future phases can extend this pattern (e.g., targeted `get` enrichment) without breaking callers.
- Per-note risk spreads across low/medium/high instead of collapsing to all-high.
- Group warnings prefixed with originating note title for actionability.

### Evidence enrichment for recall and consolidate
*Source: `evidence-enrichment-for-recall-and-consolidate-fd166604`*

Consolidate the two sequential summary notes about evidence enrichment into one note covering both phases and the key default-on decision.

# Evidence enrichment for recall and consolidate

Summary of the evidence-enrichment feature across recall and consolidate.

## Delivered

- `recall`: added optional `evidence: "compact"` and per-result `retrievalEvidence` in structured output plus compact text hints.
- `consolidate`: added optional `evidence: true` for analysis strategies with per-note merge evidence, warnings, and `mergeRisk`.
- Workflow/tool docs: updated descriptions and `mnemonic-workflow-hint` with optional evidence guidance.
- Tests: added/updated integration and unit tests for schema alignment, behavior, and docs discoverability.

## Key decision: evidence default flipped to always-on

The original opt-in design was correct in principle (token discipline) but wrong for the consolidation domain.

Consolidation deals with small result sets where evidence is cheap. The risk of bad merges without lifecycle/risk context is real and preventable. Different token budgets for different tools matters.

As a result:
- `evidence` default flipped from `false` to `true` for all consolidate analysis strategies (`detect-duplicates`, `suggest-merges`, `dry-run`)
- `execute-merge` accepts optional `evidence` param (default `true`) and renders per-note trust signals inline in text output (lifecycle, role, age, risk, warnings)
- Docs updated: README, CHANGELOG, ARCHITECTURE, docs/index.html
- Test assertion updated for new description wording
- Review notes from prior cycle updated with addenda documenting the reversal
- Decision note amended to reflect new default-on stance

## Verification

- Command: `rtk npm run typecheck` — Result: pass
- Command: `rtk npm run build:fast` — Result: pass
- Command: `rtk vitest tests/consolidate.unit.test.ts` — Result: PASS (10), FAIL (0)
- Full suite: 54 targeted tests passed, pre-existing tsc errors in `markdown-ast.ts`/`semantic-patch.ts` (missing deps) — unrelated
- 6 source files changed, 37 insertions, 14 deletions
- Work commit: `19cee01`
