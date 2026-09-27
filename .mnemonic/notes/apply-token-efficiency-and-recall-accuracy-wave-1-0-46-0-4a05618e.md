---
title: 'Apply: token efficiency and recall accuracy wave 1 (0.46.0)'
tags:
  - workflow
  - apply
  - token-efficiency
  - recall
lifecycle: temporary
createdAt: '2026-09-27T13:58:33.730Z'
updatedAt: '2026-09-27T13:58:33.730Z'
role: context
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Implementation record for wave 1. Plan: `plan-token-efficiency-and-recall-accuracy-wave-1-lanes-l1-l6-0470831c`. Branch `improve/token-efficiency-and-recall-accuracy`, released as 0.46.0 (`1af620b`).

Execution changed from delegated lanes to in-session implementation: pi-subagents children could not launch from this Claude-bridge session (MCP direct-tool selectors unresolved, then pi-claude-bridge prompt-capture rejected fresh child prompts). The user chose to implement in session; review was done in session against the plan constraints instead of by a fresh-context Opus reviewer.

## Delivered

- [x] L1 `f84aea4` fix(remember): `policyScope` added to `RememberToolResultSchema`; compile-time assertion that flattened tool schemas cover every handler field (remember, update); test helpers now validate every tools/call response against the registered outputSchema, like MCP clients do. The guard failed exactly the 5 affected tests before the fix, and found no drift in any other tool.
- [x] L2 `8af072d` deterministic recall eval: 37-note fixture (two projects + globals), 47 known-item queries in five kinds, feature-hashing embedder, `npm run eval:recall` (`--explain`, `--ollama`, `--update-baseline`), regression test against `baseline.json`, documented in CONTRIBUTING.
- [x] L3 `27d5596` fix(recall): projections persist body identifiers (lexical-only, embeddings untouched), identifier-aware tokenize (joined form + camelCase parts), legacy projections rebuild lazily.
- [x] L4 `a72f392` feat(recall): `detail: "brief"` default with summary + query-matched passage + get hint; `detail: "full"` restores bodies; weak-match hint; rounded scores.
- [x] L5 `2031d3b` feat(list): `limit` (50/200) + opaque `cursor`, `total` always present, `nextCursor`; `count` is per page.
- [x] L6 `e11cadc` feat: MCP server instructions (~700 chars) and `MNEMONIC_TOOLSET=core` (9 tools).
- [x] Release `1af620b`: 0.46.0 in package.json, lockfile, CHANGELOG.

## Measurements

- Eval (hash embeddings): identifier MRR@10 0.42 -> 0.79, S@5 0.50 -> 1.00, S@1 0.33 -> 0.58; body S@1 0.20 -> 0.30; title 1.00 and project-affinity 0.88 unchanged.
- Recall text on a copy of this vault with real embeddings: 131.8 KB -> 31.6 KB over six queries (-76%).
- tools/list: full 146.7 KB (57.0 KB without output schemas), core 78.5 KB (29.2 KB).
- Warm recall latency 163 ms -> 176-181 ms (+8-11%). First recall after upgrade 1.8 s while 125 legacy projections rebuild once.

## Deviations

- L4 kept the `scope notes | themes | anchor coverage` text line: implementation principles require recall diagnostics in text. An anchor-coverage hint was dropped because it would fire on most topical queries.
- L4 rounds decomposition priors to 4 decimals, not 3, because priors are 0.0025-scale.
- L5 keeps the existing list order (current project, other projects, global, by title) instead of newest-first; an early re-sort broke two tests that depend on that order. Added an id tie-breaker for reliable cursors.
- L6 names full-only tools in core-mode instructions instead of rewriting five tool descriptions that mention them.
- L3 plan target "top 3 for body identifiers" holds on the fixture and integration test, but on the real vault `recallScopeNoteCount` holders rank #3 and #7: notes that match the camelCase parts in both semantic and lexical channels outrank a single-channel exact match. Same root cause as the fixture's rank-2 misses: role metadata prior (0.012) exceeds the lexical rank-1 vs rank-4 RRF gap (0.0023). Needs a fusion-policy decision in wave 2.
