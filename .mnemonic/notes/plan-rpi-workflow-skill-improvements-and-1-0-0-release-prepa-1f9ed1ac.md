---
title: 'Plan: rpi-workflow skill improvements and 1.0.0 release preparation'
tags:
  - workflow
  - plan
  - rpir
  - release
  - skill-improvement
  - v1
lifecycle: temporary
createdAt: '2026-10-10T22:39:40.357Z'
updatedAt: '2026-10-10T22:39:41.297Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: request-root-improve-mnemonic-rpi-workflow-skill-and-finaliz-fe7afdc6
    type: derives-from
  - id: research-state-of-the-rpi-workflow-skill-and-the-1-0-0-relea-71158172
    type: derives-from
memoryVersion: 1
---
# Plan: rpi-workflow skill improvements and 1.0.0 release preparation

Status: endorsed under the autonomous-mode checkpoint recorded in the request root (2026-10-11). One current plan.

## Lane A: skill improvements (worker: claude-bridge/claude-sonnet-5-5)

Files: `skills/mnemonic-rpi-workflow/SKILL.md`, `skills/mnemonic-rpi-workflow/closeout-templates.md`, `src/prompts.ts`, `tests/tool-descriptions.integration.test.ts`. No other files.

- [ ] A1 Add an "Autonomous mode" section after Core Principle: when the user explicitly authorized autonomous delivery, the Research to Plan and Plan to Implement handoffs become recorded checkpoints in the request root or plan note (findings, chosen direction, assumptions, open questions) instead of stops; still stop for scope changes, authority changes (push, merge, tag, publish, destructive actions) and readings that would lead to materially different work.
- [ ] A2 Add two Common Failure Modes bullets: autonomous authorization is not permission to skip the checkpoint record or widen scope or authority; an advisory or dogfood check failure is not automatically a product bug.
- [ ] A3 In the 1a and 2a handoff sections, add one line pointing to the autonomous-mode checkpoint.
- [ ] A4 In Review add subsection "D. Quality-gate failures": classify each failing dogfood or advisory check as product regression or heuristic brittleness; for brittleness fix the check and re-verify; record the classification in the review note.
- [ ] A5 Add stage "6. Finish (branch handshake)": `git status --short` must be clean; list the commits made; offer open PR, merge, keep branch, or discard; never push, merge, tag, or publish without explicit authorization; record the chosen option in the summary note.
- [ ] A6 Commit Discipline: replace the four-step sequence with the hygiene gate (`git status --short`, `git diff -- <intended paths>`, stage exact paths, `git diff --cached --stat` shows only intended paths, commit, `git status --short`), add a named "Dirty worktree safety rules" block, add a compact "Commit-class transitions" table (class, required artifacts, exit gate).
- [ ] A7 closeout-templates.md: add a "Phase closeout checklist" and reference it from Consolidate.
- [ ] A8 src/prompts.ts: add short "Autonomous mode" and "Stage 6 — Finish" text and the hygiene gate sentence to the prompt; extend the integration test with assertions for the new headings; keep all existing assertions passing.
- [ ] A9 Verify: `npm run build` and `npx vitest run tests/tool-descriptions.integration.test.ts` pass; `npm run lint` and `npm run format:check` pass for src and tests.

Constraints: SKILL.md grows by at most about 80 lines; keep the existing terse imperative style; no placeholders; no edits outside the listed files; do not commit.

## Lane B: release preparation (worker: claude-bridge/claude-sonnet-5-5, runs after Lane A)

Files: `package.json`, `package-lock.json`, `CHANGELOG.md`, `README.md`.

- [ ] B1 `npm version 1.0.0 --no-git-tag-version`.
- [ ] B2 CHANGELOG: new `## [1.0.0] - 2026-10-11` section above 0.47.1 with a Changed section: a 1.0 stability statement (note format, vault layout, tool surface stable; breaking changes now bump the major and ship with a migration) and one user-facing bullet for the skill improvements. Follow the changelog writing principles: one or two sentences per bullet, outcome first, no implementation detail.
- [ ] B3 README: the specific-release example uses `@1.0.0`; add one sentence near the storage-format stability statement saying 1.0 starts semantic versioning for the tool surface and note format.
- [ ] B4 Verify: `node -p "require('./package.json').version"` prints 1.0.0, the lock file carries the same version in both top-level places, `git diff --stat` lists only the four files.

Constraints: do not commit; do not touch Formula (the publish workflow updates it).

## Review (fresh-context reviewer: claude-bridge/claude-sonnet-5-5)

- [ ] R1 Adversarial constraint review of Lane A and Lane B against this plan with fresh verification.

## Orchestrator

- [ ] O1 Run `npm run verify:release` fresh after review.
- [ ] O2 Work commit 1: skill, prompt, test. Work commit 2: "Prepare release 1.0.0". Memory commits happen through mnemonic.
- [ ] O3 Consolidate: decision note, summary note, update the reference note on skill improvement opportunities, retire temporary scaffolding.
- [ ] O4 Finish: clean status, report; tag and push stay with the user.

Self-check: every research finding maps to a step (open skill items to A1 to A7, prompt alignment to A8, release gate to B1 to B4 and O1, protected-branch policy to the branch already created); no placeholders; step references consistent.
