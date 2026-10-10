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
updatedAt: '2026-10-10T23:16:39.682Z'
role: summary
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: plan-rpi-workflow-skill-improvements-and-1-0-0-release-prepa-1f9ed1ac
    type: derives-from
  - id: decision-what-1-0-0-means-which-bugs-shipped-as-fixes-and-wh-e23739e3
    type: related-to
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
