---
title: 'Apply: Lane A skill improvements and Lane B 1.0.0 release preparation'
tags:
  - workflow
  - apply
  - rpir
  - release
  - skill-improvement
  - v1
lifecycle: temporary
createdAt: '2026-10-10T22:46:42.560Z'
updatedAt: '2026-10-10T23:02:28.110Z'
role: context
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: plan-rpi-workflow-skill-improvements-and-1-0-0-release-prepa-1f9ed1ac
    type: follows
memoryVersion: 1
---
# Apply: Lane A skill improvements and Lane B 1.0.0 release preparation

Both lanes ran on claude-bridge/claude-sonnet-5-5 workers, sequentially in the same worktree (2026-10-11).

## Lane A (skill, prompt, test)

- [x] A1 to A9 delivered: Autonomous mode section, two failure-mode bullets, 1a and 2a checkpoint lines, Review D, Stage 6 Finish plus canonical graph, commit hygiene gate with dirty worktree rules and transitions table, Phase closeout checklist, prompt and test extension.
- Worker evidence: build pass, single-file vitest 9/9, lint pass, format:check pass; only the four allowed files changed; SKILL.md 298 lines after (46 net added).
- Orchestrator edits after the worker: merged two adjacent closeout-template pointer lines into one; replaced the repo-specific word "dogfood" with "advisory or heuristic quality check" because the skill ships to users (user feedback); added mandate point 7 (classify failing checks) to the Review Handoff Variant after the reviewer flagged it as P2.
- Work commit: `aefd759` skill(rpi-workflow): add autonomous mode, commit hygiene gate, quality-gate triage, and branch handshake.

## Lane B (release preparation)

- [x] B1 `npm version 1.0.0 --no-git-tag-version` applied to package.json and package-lock.json.
- [x] B2 CHANGELOG `## [1.0.0] - 2026-10-11` with two Changed bullets. Orchestrator shortened the second bullet to one sentence per the changelog writing principles.
- [x] B3 README: install example uses `@1.0.0`; Stability section gains the semantic versioning sentence.
- [x] B4 Worker evidence: package.json prints 1.0.0, lock file has the version at root and packages\[""], diff limited to the four files. markdownlint skipped (binary not installed).
- Not yet committed: waits for the Lane C bug-hunt decision so the "Prepare release 1.0.0" commit stays last.

## Deviations

- Lane A worker: none. Lane B worker: none.
- Orchestrator wrote three small follow-up edits to Lane A files itself instead of re-dispatching (listed above).

## Fresh verification by orchestrator

- Command: `npm run verify:release` / Result: pass / Details: build ok, vitest 97 files and 1532 tests passed in 70.7 s, isolated dogfood packs A and B passed their required checks; one advisory finding "packA: recall answers canonical design questions" (non-blocking, classification recorded in the review note).

## Lane D (pre-1.0 fixes, worker claude-bridge/claude-sonnet-5-5)

- [x] D1 config.ts: unparseable config.json is remembered, writes refuse with the parse error, writes go through a temp file plus rename. Tests in tests/config.unit.test.ts.
- [x] D2 attached-storage.ts: readNote and readNoteMetadata return null on MalformedNoteError and do not cache it. Test in tests/attached-storage.unit.test.ts.
- [x] D3 embeddings.ts: envValue helper treats empty or whitespace env vars as unset for all provider variables. Env scan: VAULT_PATH, DISABLE_GIT, MNEMONIC_TOOLSET, EMBED_MAX_CHUNK_CHARS already safe. Tests in tests/embeddings.unit.test.ts.
- [x] D4 semantic-patch.ts: section selector with anything but replaceSection is rejected up front. Tests added.
- [x] D5 semantic-patch.ts: heading text flattens descendant text (inline code, emphasis, image alt) without adding mdast-util-to-string as a dependency. Tests added.
- Deviations: requireEnv keeps its own empty check (redundant, harmless).
- Worker evidence: build, lint, format:check pass; 4 touched test files 127 tests; full suite 97 files 1541 tests in 67 s.
- Work commit: fa6e519 fix: harden config writes, attached vault reads, env parsing, and semantic patch selectors.

## Lane E (pre-1.0 fixes, worker claude-bridge/claude-sonnet-5-5)

- [x] E1 NUL-separated git listings via new src/git-output.ts splitNulSeparated, used in document-sync (ls-tree and recency log), document-lazy-load and attached-storage listNoteIds. Tests: document-sync-nonascii.unit, document-lazy-load.unit, attached-storage.unit; document-sync mocks now emit NUL output.
- [x] E2 Read-only attachments skip repoStorage.init and write their cache ignore rules to the attached repo's git info/exclude (ensureLocalExclude, best effort, idempotent). Writable attachments keep the tracked .gitignore. Supervisor decision B taken mid-task after the worker found the attachments dir lives inside the attached repo. Test in vault.unit.
- [x] E3 pushBranch pushes HEAD:refs/heads/branch; VALID_BRANCH_PATTERN rejects a leading dash; add_attachment validates branch and pushBranch with isError responses; set_attachment_branch reuses validateBranch. Tests: git-push-branch.unit (real bare origin), attached-storage.unit, attached-vault.integration.
- Deviations: add_attachment previously had no branch validation at all (added for both fields); computePerPathLastMod exported for a test; pushBranch trimmed on store; new tests not run against unfixed code except the mocks that broke.
- Design follow-up recorded: attachment-side caches (attachments/<slug>, embeddings, projections) live inside the attached repository.
- Worker evidence: build, lint, format:check pass; seven touched test files pass; full suite 99 files 1549 tests in 66 s.
- Work commit: see git log (fix: index non-ASCII document paths, keep read-only attachments clean, and push configured branches).
