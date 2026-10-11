---
title: >-
  RPIR outcome: rpi-workflow skill revision and 1.0.0 release prepared on branch
  improve/rpi-skill-and-release-1.0.0
tags:
  - summary
  - release
  - v1
  - skill
  - rpir
  - workflow
lifecycle: permanent
createdAt: '2026-10-10T23:16:38.451Z'
updatedAt: '2026-10-11T00:18:18.842Z'
role: summary
alwaysLoad: false
project: github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
# RPIR outcome: rpi-workflow skill revision and 1.0.0 release prepared

**What shipped (branch improve/rpi-skill-and-release-1.0.0, 2026-10-11):**

- aefd759 skill(rpi-workflow): autonomous mode, commit hygiene gate with dirty worktree rules and commit-class exit gates, Review D quality-gate classification, stage 6 Finish with branch handshake, phase closeout checklist; MCP prompt and its integration test follow.
- fa6e519, 6548339, dcf6cea: eleven bug fixes with tests (details in the decision note on 1.0.0).
- 8161556 docs: semantic versioning statement, empty env values, read-only attachment guarantee, actual project id forms.
- 294aa25 Prepare release 1.0.0: package.json and lock at 1.0.0, CHANGELOG 1.0.0 section with Changed and Fixed.

**Verification:** npm run verify:release after the last fix: build ok, vitest 99 files and 1561 tests passed in 69 s, isolated dogfood packs A and B pass required checks, one pre-existing advisory. Two fresh-context adversarial reviews (skill lane: continue; fix lanes: update plan, all seven findings plus the list-merge bug closed in dcf6cea and re-verified).

**How it ran:** orchestrator in session, five sonnet 5-5 worker or reviewer lanes (skill, release prep, bug hunt, fixes D, fixes E, follow-ups F) sequential for writers and concurrent for read-only lanes. Memory artifacts: request root, research, plan, apply, three review notes (retired after consolidation).

**Status:** complete locally. Not done by design: git tag v1.0.0, git push, merge, npm publish. The publish workflow runs on the tag push and updates the Homebrew formula through a PR.

**Branch handshake:** options open PR, merge, keep branch, or discard; the user decides. Recommended: open a PR from improve/rpi-skill-and-release-1.0.0, merge, then tag v1.0.0 on main.

**Open items:** project id unification (user decision, 1.1 candidate with migration); deferred findings listed in the decision note; renovate PR #390 untouched.

## Final state (2026-10-11, after the project id work)

- Additional work commits: 99261f5 feat(project) one id for every remote form plus migration; 7a705ae fix(project) stable resolver ids and config-less vault migration; 0e2f252 migrate(v0.1.5) rewrite of this repo's 106 notes; 411a769 fix(migrate) main vault stamping, config reporting, truthful CLI summary.
- Main vault: migration committed as 1f13f30 (118 notes, 7 policy keys, 2 attachment keys, schema 1.5), one unpushed commit, push URL restored.
- Final gate: npm run verify:release passed with 101 files and 1654 tests; dogfood required checks pass; one pre-existing advisory.
- Reviews: three fresh-context adversarial reviews on the id work (block, then continue, then continue for the follow-ups).
- History: the Prepare release 1.0.0 commit (294aa25) is not last; later commits extend its changelog section. Tag v1.0.0 on the final merged commit.
- Status: complete locally. Not done by design: tag, push, merge, publish.
