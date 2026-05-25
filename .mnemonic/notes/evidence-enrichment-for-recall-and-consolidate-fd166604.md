---
title: Evidence enrichment for recall and consolidate
tags:
  - summary
  - evidence
  - recall
  - consolidate
  - verification
lifecycle: permanent
createdAt: '2026-05-25T17:38:32.222Z'
updatedAt: '2026-05-25T17:38:32.222Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: decision-expose-trust-evidence-at-decision-points-via-opt-in-244d8317
    type: derives-from
  - id: theme-evidence-enrichment-design-research-signal-inventory-d-294ccd73
    type: derives-from
  - id: decision-expose-trust-evidence-at-decision-points-via-opt-in-244d8317
    type: follows
  - id: reference-rpir-evidence-enrichment-delivery-pattern-for-mnem-4a852278
    type: follows
  - id: enriched-confidence-scoring-with-signal-strength-composite-i-06563116
    type: derives-from
  - id: retrieval-precision-and-diversity-diagnostics-implemented-763c1459
    type: related-to
memoryVersion: 1
---
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
