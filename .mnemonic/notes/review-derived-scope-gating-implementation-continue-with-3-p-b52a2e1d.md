---
title: 'Review: derived-scope gating implementation - continue with 3 P2 polish items'
tags:
  - workflow
  - review
  - recall
  - scope
  - gating
lifecycle: temporary
createdAt: '2026-08-29T21:27:59.392Z'
updatedAt: '2026-08-29T21:27:59.392Z'
role: review
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Fresh-context adversarial review (session model) of the derived-scope gating implementation. Outcome: continue. Full review text in subagent session; essentials preserved here.

## Constraint checklist: 14/14 PASS

All constraints verified with file:line citations: gate activation (src/tools/recall.ts:203), gate predicate (src/recall.ts:136-142), lexical merge clears flag (src/tools/recall.ts:627), lift guard notes+chunks empty (src/tools/recall.ts:738-741), suppression notice (:765-766), structuredContent schema unchanged, no reads create vaults (getOrCreateProjectVault only in remember.ts:89/move-memory.ts:146), onboarding regressions pass, global scope location-based in lexical (recall-helpers.ts:155) + graph (recall.ts:581) channels, docs accurate, TS-skill clean (no any/assertions; explicit return types; object param).

## Fresh verification evidence

- Command: npm run build - pass
- Command: npm test - pass (87 files, 1501 tests, 63s; both previously-flaky files passed in-suite, no reruns needed)
- Command: npm run lint - pass (zero findings)
- Command: npm run typecheck - pass
- Command: npm run dogfood:isolated - pass; derivedScopeRecallReturnsResults=true, missingCwdHintShown=true; one pre-existing vault-state advisory (canonical design question) traces to explicit scope:all call, byte-identical to pre-diff behavior, non-blocking

## Findings (no Critical/Important)

1. P2: graph-spreading evidence does NOT clear subBarGlobal for already-scored weak globals (only graph-discovered candidates weave in). In tension with documented 'arrive via graph channels' claim in CHANGELOG/README. Smallest fix: clear flag when graphScore assigned to existing candidate + test.
2. P2: pathological minSimilarity (1.0 zod max) makes bar 1.15, gating even perfect global matches. Optional hardening: exempt rawScore >= SPREADING_ACTIVATION_GATE (0.5).
3. P2: get.ts not-found pushes empty string when cwd present - harmless today (element-last + final trim) but fragile; confirm-level smell.
4. Note: 'fill the limit' phrase at docs/index.html:2249 is pre-existing historical dogfood card, untouched.
5. Note: collectLexicalRescueCandidates is dead code (pre-existing).

Pre-flagged get.ts finding: CONFIRMED as smell, REJECTED as user-visible bug.

Recommendation: continue; suggestions batched into follow-up polish pass.
