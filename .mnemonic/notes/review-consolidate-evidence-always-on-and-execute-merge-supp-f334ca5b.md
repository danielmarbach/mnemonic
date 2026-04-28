---
title: 'Review: consolidate evidence always-on and execute-merge support'
tags:
  - workflow
  - review
  - consolidate
  - evidence
lifecycle: temporary
createdAt: '2026-04-28T10:38:36.774Z'
updatedAt: '2026-04-28T10:38:36.774Z'
role: review
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
# Review: consolidate evidence always-on and execute-merge support

## Outcome

Continue — implementation complete and verification clean.

## Reviewed artifacts

- `src/index.ts` — handler default flip, strategy propagation, executeMerge evidence param + inline rendering
- `CHANGELOG.md`, `README.md`, `ARCHITECTURE.md`, `docs/index.html` — docs updated for new defaults
- `tests/tool-descriptions.integration.test.ts` — test assertion updated for new description wording

## Verification evidence

- Command: `rtk vitest tests/consolidate.unit.test.ts`
- Result: PASS (10), FAIL (0)

- Command: `rtk git diff --stat`
- Result: 6 files changed, 37 insertions(+), 14 deletions(-)

## Addenda applied

- `review-evidence-enrichment-phases-1-2-and-2-5-verification-5501cdf6` — addendum documenting opt-in reversal
- `review-evidence-enrichment-implementation-vs-plan-specificat-139a7ce2` — addendum superseding finding 2

## Changes summary

1. `evidence = false` → `true` in handler destructure (src/index.ts:5418)
2. `executeMerge` gets `evidence: boolean = true` param (src/index.ts:5828)
3. Evidence inline rendering in executeMerge text output: lifecycle, role, age, risk, warnings
4. All docs updated for default-on behavior
5. Test assertion updated for new description text

## Pre-existing issues

- `build:fast` has pre-existing tsc errors in `markdown-ast.ts` and `semantic-patch.ts` (missing `unified`/`mdast` modules) — unrelated to these changes
- Integration tests fail with `ERR_MODULE_NOT_FOUND: unified` for same reason
