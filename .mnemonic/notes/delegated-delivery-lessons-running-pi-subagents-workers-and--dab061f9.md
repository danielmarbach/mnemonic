---
title: >-
  Delegated delivery lessons: running pi-subagents workers and reviewers on
  mnemonic
tags:
  - reference
  - orchestration
  - pi-subagents
  - claude-bridge
  - review
  - git
  - workflow
lifecycle: permanent
createdAt: '2026-10-11T06:43:37.771Z'
updatedAt: '2026-10-11T06:43:39.049Z'
role: reference
alwaysLoad: false
project: github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: reference-mnemonic-rpi-workflow-skill-improvement-opportunit-1b944a63
    type: related-to
memoryVersion: 1
---
# Delegated delivery lessons: running pi-subagents workers and reviewers on mnemonic

Conditions and evidence from the 1.0 release work (skill revision, bug hunt, eleven fixes, project id unification), orchestrated in session with claude-bridge sonnet workers and reviewers.

## Mechanics

- pi-subagents children on `claude-bridge/*` models must be launched with `async: true`. Foreground children fail because the bridge's session hooks are not loaded for them.
- One git writer per repository at a time. A mnemonic memory commit running in parallel with an orchestrator `git commit` raced ("cannot lock ref HEAD"); the index survived and a plain retry worked. Serialize memory updates and work commits.
- Commit signing through 1Password blocks every git commit on the machine while 1Password is locked: the migrator's auto-commits failed, manual commits hung, and vault tests that commit hung too. Unlock first, or run tests with `HOME=<empty dir> GIT_CONFIG_NOSYSTEM=1`.
- After upgrading the server or migrating a vault, restart MCP sessions. A running server keeps its cached config and the old id resolution.

## Handoffs

- Worker verification lists must include `npm run typecheck` (covers tests). `npm run build` typechecks src only; the pre-commit hook caught a test type error a worker missed.
- A handoff that names files, the exact items, the verification commands and the return shape produced clean lanes every time; the one open-ended item ("fix only if error or silent skip") still came back with a justified fix.
- Workers should state deviations explicitly; both unplanned fixture edits in this run were reported, which made review cheap.
- Sequential writer lanes in one worktree were simpler than worktree isolation and fast enough for lanes of 5 to 15 files.

## Review

- Fresh-context adversarial reviews earned their cost: three of four code reviews found real defects (a second config writer that still clobbered, resolver ids that the canonicalizer would rewrite, a numeric path segment eaten by a port rule, config-less vaults never migrated). Self-review would have shipped all of them.
- Give reviewers permission to build scratch repos under /tmp and run the CLI there; empirical reproduction found the config-less vault gap that code reading alone had only suspected.
- Ask reviewers to enumerate every writer of a file when a fix closes a data-loss path.
- Advisory or heuristic quality checks (dogfood packs) must be classified before product changes: the one advisory in this run predates the branch and is heuristic brittleness.

## Shipped artifacts

- Anything that ships to users (the rpi-workflow skill) must not use repository vocabulary such as "dogfood"; say "advisory or heuristic quality check".
- When the user grants autonomy, the skill's user handoffs become recorded checkpoints in the request root or plan note; still stop for scope changes, authority changes (push, merge, tag, publish, destructive actions) and materially different readings of the request.
