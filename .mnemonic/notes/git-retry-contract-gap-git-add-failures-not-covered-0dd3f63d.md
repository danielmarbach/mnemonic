---
title: 'Git retry contract gap: git.add() failures not covered'
tags:
  - bug
  - git
  - retry
  - contract-gap
  - index-lock
lifecycle: temporary
createdAt: '2026-03-15T13:58:33.326Z'
updatedAt: '2026-03-15T13:58:33.326Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
## Problem

Git retry contract handles `git.commit()` failures but not `git.add()` failures. When `git.add()` hits index.lock, file mutations succeed but git operations fail before retry contract builds.

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
- git.commit() at line 101 ← RETRY ONLY COVERS THIS
- buildMutationRetryContract() captures commitWithStatus() return value
- But error thrown before return prevents retry contract creation

Previous retry cases worked because:

- git.commit() failed after git.add() succeeded
- commitWithStatus() caught error, returned {status: "failed"}
- Then retry contract built
- This case: error during git.add(), before commitWithStatus() can catch

## Design Gap

Current model: "Mutation succeeded but commit failed" → retry commit only  
This case: "Mutation succeeded but add failed" → need add retry or wrap entire operation

## Impact

Affected: remember, update, forget, move_memory, relate, unrelate, consolidate  
Severity: Medium - FS mutation succeeds, git fails, human can recover, agent cannot auto-retry

## Solutions

Option 1: Retry git.add() in commitWithStatus()
Option 2: Try-catch git.add(), convert to return value
Option 3: Wrap entire commit operation with retry

## Next Steps

1. Decide retry strategy for git.add()
2. Implement consistent retry
3. Test with simulated index.lock
4. Update retry contract docs
5. Check git.rm(), git.mv() for similar issues

## Metadata

Date: 2026-03-15  
Tool: forget  
File: performance-review-plan-for-typescript-file-and-git-i-o-path-05f563ef.md  
Git operation: git.add()  
Result: File deleted, staged, commit not executed
