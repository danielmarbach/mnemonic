---
title: 'Review: token efficiency and recall accuracy wave 1 (0.46.0)'
tags:
  - workflow
  - review
  - token-efficiency
  - recall
lifecycle: temporary
createdAt: '2026-09-27T13:58:57.491Z'
updatedAt: '2026-09-27T13:59:12.015Z'
role: review
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: apply-token-efficiency-and-recall-accuracy-wave-1-0-46-0-4a05618e
    type: derives-from
memoryVersion: 1
---
Outcome: continue

Review of wave 1 / release 0.46.0 against plan `plan-token-efficiency-and-recall-accuracy-wave-1-lanes-l1-l6-0470831c` and apply note `apply-token-efficiency-and-recall-accuracy-wave-1-0-46-0-4a05618e`. Performed in session (the requested fresh-context Opus reviewer could not be launched; see apply note), with fresh verification runs.

## Verification

- Command: `npm run verify:release` (build, full vitest, isolated dogfood). Result: pass. Details: 96 files, 1510 tests; dogfood exit 0; one advisory "packA: recall answers canonical design questions" also fires on the base commit `87912c6`, so it predates this branch.
- Command: `npm run lint`, `npm run format:check`, `npm run typecheck`. Result: pass.
- Command: `npm pack --dry-run`. Result: pass. Details: 0.46.0, 403 files, new modules present, no tests/fixtures/vault/eval files.
- Command: release smoke test from the packed tarball with real Ollama and client-side outputSchema validation. Result: pass (16/16). Details: remember under a saved policy validates (the 0.45.x bug), body identifier found, brief/full recall, list paging, get, full=28 and core=9 tools, instructions sent, legacy projections on a copy of this vault rebuilt with identifiers, projectionText unchanged.
- Command: warm recall latency, base vs branch, 4 queries x 5 runs, two rounds. Result: partial. Details: 163 ms -> 176-181 ms.
- Command: `npm run eval:recall`. Result: pass. Details: baseline updated with L3 gains, deterministic across runs.

## Constraint checklist

| Constraint | Status | Evidence |
| --- | --- | --- |
| File-first, no database/daemon/new runtime dependency | pass | No dependency changes; identifiers persist in existing projection JSON |
| Derived data recoverable by delete + sync | pass | `identifiers` lives in gitignored projections; legacy projections rebuild via `isProjectionStale` |
| No new I/O on cold/fallback paths | pass with note | Snippet and summary use the note already read by `readCachedNote`; lexical tokens stay session-cached keyed by lexical text. One-time body read per legacy projection, same precedent as `contentSignals` |
| Fail-soft to undefined | pass | `selectQuerySnippet` returns undefined; hints omitted when not applicable |
| Zod `.describe()` + Returns bullet + text + real-response schema test for new fields | pass | recall `detail`, list `limit`/`cursor`/`total`/`nextCursor`, remember `policyScope`; helpers now schema-validate every integration call |
| Embeddings unchanged by identifiers | pass | Unit test and smoke test assert identical `projectionText` |
| AGENT.md, README.md, docs/index.html in sync | pass | Updated per lane; config tables list `MNEMONIC_TOOLSET` |
| Curated CHANGELOG | pass | 0.46.0 Added/Changed/Fixed, user-facing, `count` semantics called out |
| Weak-model support | pass | Server instructions, core toolset, get hint, weak-match hint |

## Findings for wave 2

- P1 fusion policy: an exact identifier match is a single lexical rank and loses to notes matching its camelCase parts in both channels, and to the role metadata prior (0.012 vs a 0.0023 RRF gap). Real vault: `recallScopeNoteCount` holders at #3 and #7. Candidate: a bounded exact-identifier prior, measured with `eval:recall --explain`; needs an update to the canonical RRF design.
- P2 latency: +8-11% warm recall; profile tokenize in recall.ts coverage scoring and snippet selection.
- P2 relationship previews are now the largest part of brief recall output.
- Still open from research: project-affinity gating (fixture S@1 0.88), superseded collapse, chunk embeddings for long notes, output-schema trimming, cwd description dedupe, model-matrix dogfood.

## Unchecked items

None from the plan. Delegated execution and Opus review were not performed (infrastructure blocker, user redirected).
