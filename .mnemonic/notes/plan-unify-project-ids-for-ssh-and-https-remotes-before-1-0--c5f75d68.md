---
title: 'Plan: unify project ids for SSH and HTTPS remotes before 1.0.0'
tags:
  - workflow
  - plan
  - release
  - v1
  - project-identity
  - migration
lifecycle: temporary
createdAt: '2026-10-10T23:25:53.558Z'
updatedAt: '2026-10-10T23:27:02.553Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
# Plan: unify project ids for SSH and HTTPS remotes before 1.0.0

Status: endorsed by the user (2026-10-11): "align the project identity for 1.0 and not wait". Supersedes the deferral recorded in the 1.0.0 decision note.

## Approach

- Canonical id: strip the scheme first, then auth, then turn the SSH colon into a slash, so every remote form of one repo yields github-com-acme-myapp.
- Legacy ids (https-, http-, git- prefixed) are normalized at two read boundaries so un-migrated vaults keep working: note parse (storage) and config read (config keys for policies, identity overrides, attachments).
- Migration normalize-project-ids rewrites project frontmatter in every vault and the config keys; idempotent; schemaVersion bump; dry-run and execute tests per the testing requirements in AGENT.md.
- Docs: README and AGENT.md go back to the same-id statement and mention the migration; CHANGELOG gets a Changed entry.
- Apply the migration to this repo's project vault (dogfooding requirement); dry-run it against the user's main vault and report.
- Commit ordering: fix commit, then re-create the release commit last.

## Steps

- [ ] P1 Scout maps persistence points and the migration framework.
- [ ] P2 Worker implements normalization, boundaries, migration, tests, docs.
- [ ] P3 Fresh-context review, verify:release, migration dry-run on both vaults, execute on the project vault.
- [ ] P4 Commits reordered so Prepare release 1.0.0 is last; decision and summary notes updated.

- Authorization added (user, 2026-10-11): execute the migration on the global main vault at \~/mnemonic-vault as well, not only dry-run. Sequence per vault: dry-run, inspect, execute, verify (project frontmatter in notes, config keys, list_migrations shows nothing pending). The main vault is the user's live git-synced vault: do it through the built CLI from this branch, confirm the commit it creates, and do not push.
