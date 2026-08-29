---
title: 'Apply: project-anchored precision for recall''s derived default scope'
tags:
  - workflow
  - apply
  - recall
  - scope
  - gating
lifecycle: temporary
createdAt: '2026-08-29T21:20:33.609Z'
updatedAt: '2026-08-29T21:20:33.609Z'
role: context
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
All 14 plan steps implemented (flash worker subagent + orchestrator stabilization). Files: src/recall.ts (subBarGlobal flag, GLOBAL_BAR_DELTA 0.15, shouldGateGlobalCandidate, partitionGatedCandidates, selection filter + lift options), src/tools/recall.ts (derived gate in semantic loop, lexical-merge flag clear, empty-pool lift, suppression/lift/cwd-hint lines, scope zod without default, graph-filter global alignment), src/tools/recall-helpers.ts (lexical global alignment + re-export), src/helpers/project.ts (missingCwdHint + projectParam wording), hints in list/recent-memories/memory-graph/get/update/forget/where-is-memory, scripts/run-dogfood-packs.mjs (2 derived-scope observations), README/AGENT.md/CHANGELOG/docs/index.html, tests/recall.unit.test.ts (bar-boundary + gate + partition units), new tests/recall-scope-gating.integration.test.ts (9 integration tests incl. onboarding regressions).

## Deviations

- GLOBAL_BAR_DELTA lives in src/recall.ts, re-exported from recall-helpers.ts (avoids circular import; plan named recall-helpers.ts as home). Equivalent.
- Worker hit its 30-min budget mid self-repair of a botched edit in its own new test file; syntax was fixed by the worker, orchestrator applied eslint --fix (one blank line) and re-verified.
- Worker's full-suite run showed 2 test TIMEOUTS (vault.unit getPendingNoteFiles x2, working-state-continuity lifecycle recall) - both files pass fresh in targeted run (flaky under full-suite parallel load, not regressions).
- Known minor finding from TS-skill review: get.ts not-found path pushes an empty line when cwd IS present (missingCwdHint returns '' and is pushed unconditionally) - pre-flagged for review.

## Verification (orchestrator)

- Command: npm run build - Result: pass
- Command: vitest run recall-scope-gating.integration + recall.unit + vault.unit + working-state-continuity + dogfooding-runner - Result: pass (138 tests, 19s)
- Command: prettier/eslint on new test file - Result: pass
- Full suite + full lint + dogfood:isolated: deferred to fresh-context review (must run fresh).
