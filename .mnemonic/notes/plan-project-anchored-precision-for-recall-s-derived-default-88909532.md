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
updatedAt: '2026-08-29T20:40:46.880Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Derived-default read scoping for recall: keep default `all`, gate weak global semantic matches when cwd resolves a project and scope was NOT explicitly passed. Preserves the weaving design goal (curated/strong/lexical/graph-linked globals weave in; weak-global noise gated out of the default top-K). Exemption signal: `alwaysLoad: true` only (explicit, tool-settable). GLOBAL_BAR_DELTA = 0.15 (code constant). Research: `research-read-tool-scoping-behavior-and-missing-cwd-handling-8a77b8a5`.

## Steps

- [ ] 1. `src/tools/recall-helpers.ts`: export `GLOBAL_BAR_DELTA = 0.15` with rationale comment (bar = minSimilarity+0.15 = 0.45 < SPREADING_ACTIVATION_GATE 0.5, so sub-bar candidates can never be graph entry points).
- [ ] 2. `src/tools/recall.ts` scope zod: remove `.default("all")`, keep optional; update description: omitted = derived project-anchored precision, explicit values unchanged (explicit `all` is ungated).
- [ ] 3. `src/recall.ts` `ScoredRecallCandidate`: add optional `subBarGlobal?: boolean`.
- [ ] 4. `src/tools/recall.ts` semantic loop: gateActive = scope === undefined && project !== undefined; for main-vault candidates with !isCurrentProject && !isAttachedVault && meta.alwaysLoad !== true && rawScore < minSimilarity + GLOBAL_BAR_DELTA: push with subBarGlobal true (still push, never skip).
- [ ] 5. Lexical merge: when a lexical candidate attaches to an existing candidate, clear subBarGlobal (lexical admission overrides the bar).
- [ ] 6. Selection: filter !subBarGlobal before selectRecallResults/selectWorkflowResults; if selected notes AND documentChunks are both empty, re-select unfiltered (lift).
