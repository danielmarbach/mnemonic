---
title: 'Research: Branch protection for attached vault mutations'
tags:
  - workflow
  - research
  - branch-protection
  - attachments
lifecycle: temporary
createdAt: '2026-05-25T07:28:21.700Z'
updatedAt: '2026-05-25T07:28:21.700Z'
role: research
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
## Research: Branch protection architecture for attached vaults

### How protected branch checks work today

`shouldBlockProtectedBranchCommit` (git-commit.ts:141-175) checks three things:

1. `cwd` exists, `writeScope === "project"`, `automaticCommit === true`
2. `getCurrentGitBranch(cwd)` — only looks at consuming repo
3. Protected branch patterns from `policy` (consuming project's policy from `ctx.configStore.getProjectPolicy(note.project)`)
4. Returns blocked + message if branch matches patterns and behavior is not "allow"

### Key finding: `cwd` is always the consuming repo

The mutation tools pass `cwd` (from tool arguments) to `shouldBlockProtectedBranchCommit`. `cwd` is never the attached repo's path. This means the check is inherently consuming-repo-centric.

### Which tools call protected branch checks

- remember: triggers check at line ~150 when `writeScope === "project"`
- update: triggers check at line ~173 when `vault.provenance === "project-local"`
- forget: triggers check at line ~89 when `touchesProjectVault` is true (project-local or relationship cleanup)
- move_memory: triggers check at line ~145 when `targetVault.provenance === "project-local"`
- consolidate: triggers checks at lines 395 and 1054 for affected vaults
- relate: NO protected branch check at all
- unrelate: NO protected branch check at all

**Critical finding:** relate and unrelate don't check protected branches for any vault, not just attached ones. This is an existing gap even within the consuming project.

### How policies are stored

`ProjectMemoryPolicy` is stored per-project in `MnemonicConfig.projectMemoryPolicies`, keyed by `ProjectId`. The config lives in the main vault (`~/.mnemonic/config.json`). There is no mechanism to resolve the attached repo's policy from the consuming repo's config.

### Plumbing needed for attached repo protection

To properly protect the attached repo, we need:

1. Attached repo's git root path (from `attachmentRef.localPath`)
2. Its current branch (`getCurrentGitBranch(localPath)`)
3. Its project policy (`ctx.configStore.getProjectPolicy(attachmentRef.projectSlug)`)

Steps 1 and 2 are straightforward. Step 3 assumes the attached repo's project policy was also configured in the consuming main vault's config. This is the correct design (policies are local to user/machine), but it means if the user never set a policy for the attached repo, it falls back to default (no protection).

### `getCurrentGitBranch` capability

It runs `git -C <directory> rev-parse --abbrev-ref HEAD`. Works for any directory, not just cwd.

### `allowProtectedBranch` override semantics

Currently: if `allowProtectedBranch === true`, check returns `{ blocked: false }`. For multi-repo, one override should cover all vaults involved in the operation. Splitting into per-repo overrides adds friction.

### Commit patterns

Mutating tools touching multiple vaults make one commit per vault. The protected branch check should run before each vault's commit, not once globally. This allows some vaults to commit while others are blocked.

Example: relate from local note A to attached note B:

1. Check consuming repo branch — ok
2. Commit A's relationship in consuming repo
3. Check attached repo branch — needs check here
4. Commit B's relationship in attached repo

Current code: step 3 is missing entirely.

### Risk: consolidate and move_memory

These tools can touch many vaults. consolidate already iterates vaults and checks protection for project-local vaults. It needs extension to check attached vaults too.

### Summary of gaps by tool

- remember: consuming repo checked, attached repo N/A (creates in local vault) — OK
- update: consuming repo checked for project-local, attached repo missing — GAP
- forget: consuming repo checked for project-local or cleanup, attached repo missing — GAP
- relate: no check for any vault — DOUBLE GAP
- unrelate: no check for any vault — DOUBLE GAP
- move_memory: target local checked, target attached missing — GAP
- consolidate: affected local checked, affected attached missing — GAP

### Architectural question

Should the check live in each tool (current pattern) or in a centralized helper that each vault commit loop calls? The current per-tool pattern is brittle — 7 tools with slightly different logic. A centralized helper would be more maintainable.
