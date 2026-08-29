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
updatedAt: '2026-08-29T20:46:02.333Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: rpir-request-smarter-default-scoping-for-recall-and-read-too-7ffd0632
    type: derives-from
memoryVersion: 1
---
Derived default scope `all` for recall stays; gate weak global SEMANTIC candidates when cwd resolves a project and scope was NOT explicitly passed. Weaving goal preserved: curated (`alwaysLoad: true`), strong matches (rawScore >= minSimilarity + GLOBAL_BAR_DELTA = 0.15), lexical-exact, and graph-linked globals still weave in. Research: research-read-tool-scoping-behavior-and-missing-cwd-handling-8a77b8a5.

## Steps

- [ ] 1. recall-helpers.ts: export GLOBAL_BAR_DELTA = 0.15 (comment: bar 0.45 < SPREADING_ACTIVATION_GATE 0.5, so sub-bar candidates never become graph entry points).
- [ ] 2. recall.ts scope zod: drop .default("all"); description documents derived default; explicit values unchanged (explicit all = ungated).
- [ ] 3. src/recall.ts ScoredRecallCandidate: optional subBarGlobal?: boolean.
- [ ] 4. Semantic loop: gateActive = scope undefined && project; main-vault + !isCurrentProject + !isAttachedVault + alwaysLoad !== true + rawScore < minSimilarity + DELTA: push flagged (still push, never skip).
- [ ] 5. Lexical merge clears the flag (lexical admission overrides the bar).
- [ ] 6. Selection filters flagged candidates; empty notes AND empty chunks -> re-select unfiltered (lift).
- [ ] 7. Output: suppressed-count line when gated notes dropped; lift line when widened; no structuredContent schema change.
- [ ] 8. global-scope alignment: collectLexicalCandidates + graph filter switch to vault-provenance (main vault only), matching semantic channel and vault-routing test :379.
