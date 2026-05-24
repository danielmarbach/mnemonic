---
title: 'Review: Multi-repo attachment Phase 3'
tags:
  - workflow
  - review
  - attachments
  - phase3
lifecycle: temporary
createdAt: '2026-05-24T13:11:15.074Z'
updatedAt: '2026-05-24T13:11:15.074Z'
role: review
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
# Review: Multi-repo attachment Phase 3

## Verdict: UPDATE PLAN

Structurally sound but gaps need fixing. 3 violations, test regressions, deliverable gaps on items 21-25, 34-41.

## Constraint checklist

| Constraint | Status | Evidence |
| --- | --- | --- |
| No new I/O on cold paths | PASS | Write paths gated behind explicit writable flag. `attached-storage.ts:117-149` |
| Fail-soft to undefined | PASS (caveat) | `attachedVaultErrorMessage` unconditionally says read-only — no writable check |
| Session cache reuse | PASS | `invalidateActiveProjectCache()` called after all mutations |
| Explicit enablement | PASS | Defaults in `add-attachment.ts:62`, `attached-storage.ts:26`, `vault.ts:36` |
| Backward compatible | PASS | `storage.ts:32` optional, `relationships.ts:191-193` fallback to noteById map |
| Git commit scoping | PASS | `git.ts:111-142` uses scopedFiles, notesRelDir scoped to `.mnemonic/notes` |
| No third-party deps | PASS | No new deps in package.json |

## Violations

### V1: AttachedStorage.invalidateCache() never called (MEDIUM)

`AttachedStorage.noteCache`/`noteIdCache` stale after write-through mutations. Session cache invalidated but storage-level cache not. Affects writable attached vaults with branch set.

### V2: branchTipHash not updated after write-push (MEDIUM)

`pushAfterMutation` (`helpers/persistence.ts:205-229`) doesn't update `attachmentRef.branchTipHash`. Causes redundant staleness reloads on next check.

### V3: Dual writable getter implementations (LOW)

`loadAttachmentsForProject` (vault.ts:300) uses `config.writable === true`. `makeVault` (vault.ts:421) uses `provenance !== "project-attached"`. Not a live bug but maintenance trap.

## Deliverable gaps

- Items 21-22: session cache invalidated, AttachedStorage cache + branchTipHash not updated
- Item 23: `attachedVaultErrorMessage` no writable check
- Item 24: tool descriptions don't mention writable
- Item 34 (deferred): dangling cross-vault refs in non-writable vaults on forget
- Items 35-38 (deferred): partially implemented — cross-vault resolution works
- Items 39-41: 6 skipped tests untouched

## Verification evidence

- `npx tsc --noEmit`: PASS
- `npm test`: 3 failed, 1092 passed, 6 skipped
- Failures: `relationship-expansion.integration.test.ts` (2) possibly from `f774c12`, `project-memory-summary.integration.test.ts` (1) pre-existing

## Recommended fixes

1. Fix AttachedStorage cache invalidation post-write (V1)
2. Update branchTipHash after write-push (V2)
3. Unify writable getter (V3)
4. Investigate 2 failing relationship tests
5. Update attachedVaultErrorMessage for writable case (item 23)
6. Unskip 6 mutation error tests (item 39)
