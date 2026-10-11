---
title: 'Review: project id unification commit 99261f5 (fresh-context adversarial)'
tags:
  - workflow
  - review
  - project-identity
  - migration
  - v1
lifecycle: temporary
createdAt: '2026-10-10T23:43:38.736Z'
updatedAt: '2026-10-10T23:43:39.234Z'
role: review
alwaysLoad: false
project: github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: plan-unify-project-ids-for-ssh-and-https-remotes-before-1-0--c5f75d68
    type: derives-from
memoryVersion: 1
---
# Review: project id unification commit 99261f5 (fresh-context adversarial)

Outcome: block (Lane H dispatched to close every finding before execution on real vaults)

Reviewer: fresh-context reviewer on claude-bridge/claude-sonnet-5-5, 2026-10-11. Build, lint, format and the full suite (99 files, 1614 tests) pass; reverting src in a scratch copy made 66 of the new tests fail, so the tests do guard the change.

## Findings and decisions

- P1-a: stripping ssh- and http- rewrites ids the resolver itself produces (<git@ssh.dev.azure.com> yields ssh-dev-azure-com-..., parse turns it into dev-azure-com-..., so note.project never equals project.id; folder ids like http-server have the same shape). Decision: strip only https- and http-, and make every id producer a fixed point of canonicalProjectId.
- P1-b: an scp remote whose first path segment is numeric (<git@github.com>:1234/repo) lost that segment to the port rule. Decision: port rule only after a scheme was stripped.
- P1-c (G3b): a project vault without config.json reports the default schema version and is never selected for migration; this repo's own vault and most project vaults are in that state; the 0.1.0 and 0.1.1 backfills had the same blind spot. Decision: missing config.json means 0.0 for pending computation in every caller, and new project vaults record their schema version at creation with a commit.
- P2-a: config edits without a schema advance stay uncommitted. P2-d: config rewrite counted as a modified note. Decision: configModified flag, committed when set, printed by the CLI.
- P2-b: recall-eval fixture passes only through the legacy read path. Decision: canonical fixture ids with one intentional legacy note.
- P2-c: stacked prefixes are not a fixed point. Decision: loop until stable.
- Docs: wording must follow the final prefix set and the config-less vault behavior.

## Verification evidence (reviewer, fresh)

- Command: npm run build / lint / format:check / Result: pass
- Command: npm test / Result: pass / Details: 99 files, 1614 tests
- Scratch: /tmp/rv fixtures reproduced G3b (no vault section without config.json; with schemaVersion 1.4 the migration lists 1 note)

## Note

The untracked .mnemonic/config.json the reviewer flagged as a stray test side effect was written on purpose by the orchestrator at the user's request (schema 1.4) so this repo's vault is migratable.
