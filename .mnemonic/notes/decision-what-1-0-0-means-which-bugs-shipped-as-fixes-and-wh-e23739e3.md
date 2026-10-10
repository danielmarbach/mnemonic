---
title: 'Decision: what 1.0.0 means, which bugs shipped as fixes, and what was deferred'
tags:
  - decision
  - release
  - v1
  - skill
  - rpir
  - bug-fixes
  - orchestration
lifecycle: permanent
createdAt: '2026-10-10T23:16:37.091Z'
updatedAt: '2026-10-10T23:16:40.480Z'
role: decision
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: rpir-outcome-rpi-workflow-skill-revision-and-1-0-0-release-p-23037b96
    type: related-to
  - id: reference-mnemonic-rpi-workflow-skill-improvement-opportunit-1b944a63
    type: related-to
  - id: semantic-patch-design-usability-fixes-and-known-footguns-a45c4f5a
    type: related-to
memoryVersion: 1
---
# Decision: what 1.0.0 means, which bugs shipped as fixes, and what was deferred

**Decision:** 1.0.0 (2026-10-11) declares the note format, vault layout, MCP tool surface and CLI stable; breaking changes from here bump the major and ship with a migration. The release carries the rpi-workflow skill revision and eleven bug fixes from a pre-release bug hunt; five findings are deferred with reasons.

**Rationale:** the version had been 0.47.x with a stable storage format and migration support for months. The bug hunt was read-only and fresh-context, and every must-fix item that touched data safety or silently lost data was fixed with tests before the release commit. Items left open either need a product decision with a data migration or are not data-loss paths.

## Fixes that shipped (commits fa6e519, 6548339, dcf6cea)

- Unparseable config.json: reads fall back to defaults, every writer (setters and the migration schema-version writer) refuses with the parse error, writes are atomic, a refused write does not linger in the cache, a missing config starts from a deep copy of the defaults.
- Malformed note in an attached vault returns null (MalformedNoteError only) instead of breaking list and dropping the attachment from recall.
- Empty or whitespace embedding env vars count as unset.
- Semantic patch: section selector only with replaceSection; heading text includes inline code, emphasis and image alt; a list inserted next to a list merges into it so checklists stay tight (root cause: the serializer forces "-" bullets, so two adjacent lists re-parse as one loose list).
- Git listings use NUL separation so non-ASCII document paths index.
- Read-only attachments never touch the attached repo's tree: no init of its vault folders, ignore rules go to the repo's git info/exclude (option B chosen mid-task after the worker found that attachment caches live inside the attached repo under its vault folder).
- pushBranch pushes HEAD:refs/heads/branch; branch names starting with a dash are rejected in validateBranch, add_attachment (branch and pushBranch) and set_attachment_branch.

## Deferred and why

- Project id normalization (HTTPS remotes yield https-github-com-..., SSH yields github-com-...): needs a migration of project frontmatter and config keys; the user's own main vault has seven policies and two attachments keyed by the https form. Docs now describe the actual behavior. Candidate for 1.1 with alias matching plus migration.
- updateAttachedBranchTipHash persists under the attached repo's own project id (in-memory ref correct; only a redundant reload).
- move_memory commits the source deletion even when the target commit failed (note remains on disk; needs commit ordering and a reported source commit result).
- Lazy-loaded document chunks skip the embedding compatibility check after a restart.
- Per-process config cache never invalidates, so concurrent servers can overwrite each other's config.
- Small: execute_migration failure lacks isError; a single named migration bumps the schema past older pending ones; forget under-counts relationshipsCleaned per extra vault; lazy-load caps at 5000 files while sync is uncapped; validateOllamaUrl rejects IPv6 localhost and accepts 10.evil.com; withGenerationLock is not a mutex; no SIGINT or SIGTERM handlers; attachment-side caches live inside the attached repo; exclude patterns assume localPath is the repo toplevel.

## Skill decisions

- Autonomous mode added to mnemonic-rpi-workflow: explicit autonomy turns the two user handoffs into recorded checkpoints; stops remain for scope, authority and materially different readings. Added because the skill's mandatory handoffs conflicted with the explicit autonomy grant in this very run.
- Repo-specific vocabulary (dogfood) was removed from the shipped skill; it speaks of advisory or heuristic quality checks.

## Orchestration lessons (conditions and evidence)

- pi-subagents children on claude-bridge/claude-sonnet-5-5 must run with async: true; foreground children fail because the bridge hooks are not loaded.
- Never run an external git commit while a mnemonic mutation is in flight in the same repo: a parallel update raced the work commit (cannot lock ref HEAD). Serialize git writers.
- A reviewer closing a data-loss path must enumerate every writer of the file, not only the one named in the report (writeVaultSchemaVersion was missed by the first fix).
- The release advisory "packA: recall answers canonical design questions" is heuristic brittleness, present since the 0.46.0 base commit.

**Alternatives considered:** fixing the project id now with a migration (rejected for 1.0 timing and the pending product call); isolating fix lanes in worktrees (rejected: sequential single-writer lanes were simpler and fast enough); skipping repoStorage.init only without the exclude file (rejected: embeddings would dirty the attached repo later).

**Consequences:** 1.0 ships with accurate docs and a tracked follow-up list; the next minor can take the id unification with a migration.
