---
title: Automatic branch change detection and sync
tags:
  - git
  - branch-switch
  - sync
  - automation
lifecycle: permanent
createdAt: '2026-03-14T22:41:26.358Z'
updatedAt: '2026-03-14T22:41:26.358Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Automatic branch change detection and sync for all tool operations.

When a developer switches git branches and calls any mnemonic tool, the branch change is detected and sync is automatically triggered to rebuild embeddings. This ensures consistent behavior without requiring manual `sync` calls after branch switches.

Implementation approach:

- Created `src/branch-tracker.ts` module to track last-seen branch per `cwd`
- Added `ensureBranchSynced(cwd)` wrapper to all tools that accept `cwd` parameter
- Git command runs once per `cwd` per process (in-memory cache)
- Auto-sync triggered only when branch actually changes (not on every call)

Added to these tools: `remember`, `recall`, `update`, `move_memory`, `get`, `list`

Behavioral impact:

- First call per `cwd`: no git overhead (no cached branch yet)
- Subsequent calls: single cached git branch check (negligible overhead)
- Branch switch detected: automatic sync of main + project vaults, embeddings rebuilt
- No config flag needed: useful by default for common branch-switching workflow
- Read-only tools like `list` and `get` also include check so embeddings are up-to-date for any operation

Alternative approaches considered:

- Config flag for opt-in: rejected as unnecessary complexity
- Skip check on read-only tools: rejected since sync is needed for embedding availability anyway
- File watching: rejected as overkill and requires background process

No config needed - the feature is useful by default and overhead is minimal.

Files created:

- `src/branch-tracker.ts`: Branch tracking and change detection module

Files modified:

- `src/index.ts`: Added `ensureBranchSynced(cwd)` calls to tool handlers and import
