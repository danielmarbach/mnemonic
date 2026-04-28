---
title: 'Summary: consolidate evidence always-on and execute-merge evidence support'
tags:
  - summary
  - consolidate
  - evidence
  - execute-merge
lifecycle: permanent
createdAt: '2026-04-28T10:40:03.748Z'
updatedAt: '2026-04-28T10:40:03.748Z'
role: summary
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
# Summary: consolidate evidence always-on and execute-merge evidence support

## Delivered

- `evidence` default flipped from `false` to `true` for all consolidate analysis strategies (`detect-duplicates`, `suggest-merges`, `dry-run`).
- `execute-merge` accepts optional `evidence` param (default `true`) and renders per-note trust signals inline in text output (lifecycle, role, age, risk, warnings).
- Docs updated: README, CHANGELOG, ARCHITECTURE, docs/index.html.
- Test assertion updated for new description wording.

## Key learning

The original opt-in design was correct in principle (token discipline) but wrong for the consolidation domain. Consolidation deals with small result sets where evidence is cheap. The risk of bad merges without lifecycle/risk context is real and preventable. Different token budgets for different tools matters.

## Verification

- `rtk vitest tests/consolidate.unit.test.ts` — PASS (10), FAIL (0)
- 6 source files changed, 37 insertions, 14 deletions
- Pre-existing tsc errors in `markdown-ast.ts`/`semantic-patch.ts` (missing deps) — unrelated

## Artifacts created

- Request note, research note, plan note, review note for this cycle
- Review notes from prior cycle updated with addenda documenting the reversal
- Decision note amended to reflect new default-on stance
