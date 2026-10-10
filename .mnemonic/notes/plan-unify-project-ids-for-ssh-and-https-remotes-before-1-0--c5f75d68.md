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
updatedAt: '2026-10-10T23:51:26.349Z'
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

- P1 done: scout map (artifact 28baefee) found a duplicate normalizeRemote in add-attachment.ts, config keys plus inner policy.projectId plus attachment projectSlug, attachment cache dirs named by the consuming project id, the document manifest storing projectId and a config hash, and the v011 and v014 migrations as templates. Lane G (worker) dispatched with G1 normalizer, G2 read-boundary canonicalizer, G3 migration normalize-project-ids with schema 1.5, G4 manifest check, G5 docs and changelog.

- P2 done: Lane G committed as 99261f5 (normalizeRemoteUrl shared by project.ts and add_attachment, canonicalProjectId at parseNote and config readAll, migration v0.1.5-normalize-project-ids, schema 1.5, manifest legacy id fix, docs and changelog; full suite 99 files 1614 tests). Dry-run observations: main vault at schema 1.1 shows v0.1.4 (0 changes) and v0.1.5 (119 of 136 notes) pending; the project vault dry-run with --cwd printed no vault section although 100+ notes carry legacy ids and it has no config.json. Review dispatched with that as the top item (G3b).

- G3b root cause (orchestrator, confirmed in src/config.ts readVaultSchemaVersion): a vault without config.json reports defaultConfig.schemaVersion, so it looks fully migrated. User decision: add .mnemonic/config.json with schemaVersion 1.4 to this repo now (uncommitted; the migration execute bumps it to 1.5 and commits it with the notes). Dry-run with --cwd now shows v0.1.5 pending: 107 processed, 105 to modify. Lane H after the review: missing config.json means unknown (run all pending), project vault creation writes config.json with the current schema version, tests, changelog line.

- Review of 99261f5: block. Lane H dispatched for P1-a (only https- and http- prefixes, fixed-point producers), P1-b (port rule only after a scheme), P1-c (missing config.json counts as 0.0 everywhere; new project vaults write and commit config.json at creation), P2-a and P2-d (configModified flag, committed and printed), P2-b (canonical fixtures plus one legacy note), P2-c (loop until stable), docs. Execution on real vaults waits for Lane H and its review.

- Lane H committed as 7a705ae after the orchestrator fixed one test typecheck error the worker missed (workers ran npm run build, which typechecks src only; the pre-commit hook caught tests/migration.unit.test.ts). Lesson: worker verification lists must include npm run typecheck. Re-review dispatched; migration execution on both vaults and verify:release follow a continue outcome.
