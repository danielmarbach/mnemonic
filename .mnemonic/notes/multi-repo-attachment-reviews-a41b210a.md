---
title: Multi-repo attachment reviews
tags:
  - workflow
  - review
  - attachments
  - phase2
  - phase3
lifecycle: permanent
createdAt: '2026-05-25T17:21:23.812Z'
updatedAt: '2026-05-25T17:21:23.812Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Consolidate Phase 2 and Phase 3 review notes while preserving separate verdicts, constraint evidence, and follow-up gaps.

# Multi-repo attachment reviews

Consolidated review record for multi-repository attachment work across Phase 2 and Phase 3.

## Phase 2 Review

Verdict: continue.

All checked constraints passed:

- No new I/O on cold paths.
- Fail-soft behavior was preserved.
- Session cache reuse was preserved.
- Explicit enablement and bounded counts were preserved.
- Performance principles were followed.
- `ATTACHMENT_BOOST = 0.015` was present.
- Attached notes passed `scope: "project"` filtering.
- Attached notes were excluded from `scope: "global"`.
- `ProjectSummaryNotesSchema.attachedVault` existed as an optional field.
- Scope descriptions mentioned attached vaults.
- Staleness detection on load was present.
- No `isProject` references remained.

Mutation path review found no write paths to attached vault notes; write paths were guarded at multiple levels.

Verification reported TypeScript passing and 1064 tests passing with 9 skipped and 0 failed.

## Phase 3 Review

Verdict: update plan.

The Phase 3 design was structurally sound, but several implementation gaps remained.

## Phase 3 Violations

### AttachedStorage cache invalidation

`AttachedStorage.noteCache` and `noteIdCache` could remain stale after write-through mutations. Session cache invalidation existed, but the storage-level cache also needed invalidation.

### branchTipHash update after write-push

`pushAfterMutation` did not update `attachmentRef.branchTipHash`, causing redundant staleness reloads on later checks.

### Dual writable getter implementations

Writable attachment behavior was implemented in more than one place, creating a maintenance trap even if it was not a live bug.

## Phase 3 Deliverable Gaps

- Invalidate attached storage cache after writes.
- Update `branchTipHash` after write-push.
- Make `attachedVaultErrorMessage` conditional for writable attachments.
- Update tool descriptions to mention writable attachments.
- Handle dangling cross-vault references best-effort when forgetting notes.
- Complete relationship preview and expansion behavior across vaults.
- Re-enable or replace skipped mutation error tests.

## Phase 3 Verification

- `npx tsc --noEmit`: passed.
- `npm test`: 1092 passed, 6 skipped, 3 failed.
- Failing areas were relationship expansion integration tests and project memory summary integration tests, with at least one failure believed pre-existing.
