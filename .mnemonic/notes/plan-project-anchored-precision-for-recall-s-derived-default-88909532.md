---
title: 'Plan: project-anchored precision for recall''s derived default scope'
tags:
  - workflow
  - plan
  - recall
  - scope
  - gating
lifecycle: temporary
createdAt: '2026-08-29T20:40:46.880Z'
updatedAt: '2026-08-29T20:45:05.053Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: rpir-request-smarter-default-scoping-for-recall-and-read-too-7ffd0632
    type: derives-from
memoryVersion: 1
---
Derived-default read scoping for recall: keep default `all`, gate weak global semantic matches when cwd resolves a project and scope was NOT explicitly passed. Preserves the weaving design goal (curated/strong/lexical/graph-linked globals weave in; weak-global noise gated out of the default top-K). Exemption signal: `alwaysLoad: true` only (explicit, tool-settable). GLOBAL\_BAR\_DELTA = 0.15 (code constant). Research: `research-read-tool-scoping-behavior-and-missing-cwd-handling-8a77b8a5`.

## Steps

## Steps (continued)

- [ ] 7\. Output: header keeps `scope: all`; suppressed>0 adds one line 'N weak global matches suppressed — pass scope: all to include'; lift adds 'no project matches; showing all matches'. No structuredContent schema change.
- [ ] 8\. global-scope alignment (location-based across channels, matches vault-routing test :379): `collectLexicalCandidates` replaces the `isProjectNote` check with vault-provenance skip; recall.ts graph filter (\~:557) replaces `meta.project !== undefined` with vault-provenance skip.
- [ ] 9\. Missing-cwd hints: recall/list/recent\_memories/memory\_graph append one line when cwd undefined; get/update/forget/where\_is\_memory append hint to not-found responses when cwd omitted.
- [ ] 10\. `src/helpers/project.ts` projectParam description: consequence-oriented (without cwd only the global main vault is visible).
- [ ] 11\. Tests: derived gating excludes weak unassociated globals; alwaysLoad exemption; explicit all ungated; empty-pool lift; strong-lexical override; missing-cwd hints; global scope includes project-tagged main-vault note; onboarding regressions (below).
- [ ] 12\. Docs: README recall scope section, AGENT.md wording, CHANGELOG.
- [ ] 13\. Verify: `npm run build`, `npm test`, `npm run lint`, `npm run typecheck` green.

## Onboarding constraints (must not break)

- Unadopted project (no .mnemonic/, no policy) + cwd recall: no error, existing project-tagged global notes stay visible, empty results lift to sub-bar globals — pre-adoption behavior unchanged or better.
- Fresh adoption via global choice: main-vault notes with project association are isCurrentProject, never gated.
- Fresh adoption via project vault: project-vault notes never gated.
- remember unadopted-ask elicitation and vault-creation rules untouched; project\_memory\_summary untouched.

## Constraints

## Additions: homepage, dogfood, tests (post-handoff)

- [ ] 16\. Test placement. UNIT: gate predicate + selection filter/lift as pure exported helpers in src/recall.ts (backward-compatible optional param on selectRecallResults/selectWorkflowResults), tested in tests/recall.unit.test.ts. INTEGRATION: new tests/recall-scope-gating.integration.test.ts via callLocalMcp + fake embedding server — read tests/helpers/mcp.ts first to learn vector control, position similarities around the bar (e.g. via minSimilarity). Update tool-descriptions/mcp-schema-contract tests for changed param text.
- [ ] 17\. Verify: add `npm run dogfood:isolated` to step 13 commands.

- [ ] 14\. Homepage (docs/index.html): update the 'Project-scoped recall' feature card to state the derived default honestly (weak global matches gated; curated/strong/lexical/graph-linked remain; explicit scope 'all' disables gating). Check recall JSON examples on the page and include cwd where shown. Historical dogfood card recall-heuristic-instead-of-full-dynamic-context-12324717 (fill-the-limit idea, note no longer in vault) stays as-is; do NOT reintroduce fill-the-limit language — July RRF decision supersedes (bounded prior, no hard project-first).

- [ ] 15\. Dogfood: run `npm run dogfood:isolated`, no NEW advisories vs baseline. Pack A line 98 passes explicit scope all (unaffected); other recall calls pass cwd without scope — derived gating is exercised. Add two bounded Pack A observations: derived-scope recall with cwd returns results; recall without cwd shows the missing-cwd hint line. Keep dogfooding-runner tests green.

- No behavior change when scope is explicitly passed or when cwd/project unresolved.

- Lexical/graph thresholds untouched; tags/lifecycle filters orthogonal to gating.

- No new config/env; no structuredContent schema break.

Implementation: flash subagent. Review: fresh-context subagent, session model. Self-check: every research requirement maps to a step; no placeholders; steps cite concrete files.

- [ ] 1\. `src/tools/recall-helpers.ts`: export `GLOBAL_BAR_DELTA = 0.15` with rationale comment (bar = minSimilarity+0.15 = 0.45 < SPREADING\_ACTIVATION\_GATE 0.5, so sub-bar candidates can never be graph entry points).
- [ ] 2\. `src/tools/recall.ts` scope zod: remove `.default("all")`, keep optional; update description: omitted = derived project-anchored precision, explicit values unchanged (explicit `all` is ungated).
- [ ] 3\. `src/recall.ts` `ScoredRecallCandidate`: add optional `subBarGlobal?: boolean`.
- [ ] 4\. `src/tools/recall.ts` semantic loop: gateActive = scope === undefined && project !== undefined; for main-vault candidates with !isCurrentProject && !isAttachedVault && meta.alwaysLoad !== true && rawScore < minSimilarity + GLOBAL\_BAR\_DELTA: push with subBarGlobal true (still push, never skip).
- [ ] 5\. Lexical merge: when a lexical candidate attaches to an existing candidate, clear subBarGlobal (lexical admission overrides the bar).
- [ ] 6\. Selection: filter !subBarGlobal before selectRecallResults/selectWorkflowResults; if selected notes AND documentChunks are both empty, re-select unfiltered (lift).
