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
updatedAt: '2026-08-29T21:20:39.624Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: rpir-request-smarter-default-scoping-for-recall-and-read-too-7ffd0632
    type: derives-from
  - id: apply-project-anchored-precision-for-recall-s-derived-defaul-2d318266
    type: follows
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
- [ ] 9. Missing-cwd hints: recall/list/recent_memories/memory_graph one line when cwd undefined; get/update/forget/where_is_memory hint in not-found responses.
- [ ] 10. projectParam description: consequence-oriented (without cwd only the main vault is visible).
- [ ] 11. Unit: gate predicate + filter/lift in recall.unit.test.ts. Integration: new recall-scope-gating.integration.test.ts via callLocalMcp + fake embedding server (read tests/helpers/mcp.ts first for vector control): gating, alwaysLoad exemption, explicit-all, lift, lexical override, hints, global alignment, onboarding regressions.
- [ ] 12. Docs: README scope section, AGENT.md, CHANGELOG, homepage docs/index.html 'Project-scoped recall' card + recall examples (include cwd); do NOT reintroduce fill-the-limit language (July RRF decision supersedes).
- [ ] 13. Dogfood: npm run dogfood:isolated — no new advisories; add Pack A observations (derived recall with cwd works; missing-cwd hint without cwd).
- [ ] 14. Verify: build, test, lint, typecheck, dogfood:isolated.

## Onboarding constraints

Unadopted project + cwd: no error; project-tagged global notes stay visible; empty results lift (pre-adoption unchanged or better). Global-policy adoption: project association -> isCurrentProject, never gated. Project-vault adoption: never gated. remember ask/vault-creation rules + project_memory_summary untouched.

## Constraints

No behavior change for explicit scope or unresolved cwd/project. Lexical/graph thresholds untouched. Tags/lifecycle orthogonal to gating. No new config/env; no schema break.

Implementation: flash subagent. Review: fresh-context subagent (session model). Self-check: all research requirements mapped to steps 1-14; no placeholders.
