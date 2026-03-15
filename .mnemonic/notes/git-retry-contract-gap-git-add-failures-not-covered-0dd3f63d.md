---
title: 'Git retry contract gap: git.add() failures not covered'
tags:
  - bug
  - git
  - retry
  - fixed
  - index-lock
lifecycle: permanent
createdAt: '2026-03-15T13:58:33.326Z'
updatedAt: '2026-03-15T14:28:08.150Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
## Problem

Git retry contract handled `git.commit()` failures but not `git.add()` failures. When `git.add()` hit index.lock, file mutations succeeded but git operations failed before retry contract built.

## Incident

Tool: forget deleting performance-review-plan note  
What happened:

- File deleted ✓
- Embedding removed ✓
- git.add() called
- Git lock error: "Unable to create .git/index.lock: File exists"
- Error before commit attempt
- Result: Deletion succeeded, git incomplete (staged but not committed)

## Root Cause

GitOps.commitWithStatus() (src/git.ts:88-111):

- git.add() at line 95 ← LOCK ERROR HERE
- git.commit() at line 101 ← RETRY ONLY COVERED THIS
- buildMutationRetryContract() captured commitWithStatus() return value
- But error thrown before return prevented retry contract creation

## Solution Implemented

### 1. Retry logic for git.add()

Added `addWithRetry()` private method with:

- 3 retry attempts for index.lock errors
- Exponential backoff: 50ms → 100ms → 200ms
- Transient lock errors self-heal without user intervention
- Persistent locks still fail gracefully after 3 attempts

### 2. CommitResult.operation field

Extended `CommitResult` interface to track which operation failed:

```typescript
interface CommitResult {
  status: "committed" | "skipped" | "failed";
  operation?: "add" | "commit";  // which op failed
  error?: string;
}
```

### 3. PersistenceStatus.commitOperation

Added `commitOperation` to structured output for client visibility:

- `commitOperation: "add"` — files never staged, retry needs to re-add
- `commitOperation: "commit"` — files staged, retry only re-commits

### 4. Consistent naming

- `commitError` mirrors `pushError` (both have `Error` suffix)
- `commitOperation` clearly indicates which git command failed

## Files Changed

- `src/git.ts` — addWithRetry(), CommitResult.operation
- `src/structured-content.ts` — PersistenceStatus.commitOperation
- `src/index.ts` — buildPersistenceStatus includes operation
- `tests/git.test.ts` — retry tests for add failures
- `tests/mcp.integration.test.ts` — verify commitOperation in output

## Impact

Affected tools: remember, update, forget, move_memory, relate, unrelate, consolidate

Before: `git.add()` lock errors left orphan mutations with no retry guidance  
After: Transient lock errors self-heal; persistent failures return actionable retry contract

## Lessons

- Multi-agent sessions amplify index.lock probability (see related note)
- Wrap entire git operation sequence that can fail, not just the final step
- `operation` field clients understand which sub-step needs retry
