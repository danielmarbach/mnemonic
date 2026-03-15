---
title: 'Git index.lock frequency analysis: zombie processes and tool patterns'
tags:
  - investigation
  - git
  - index-lock
  - zombie-processes
  - concurrency
lifecycle: temporary
createdAt: '2026-03-15T14:01:48.412Z'
updatedAt: '2026-03-15T14:05:56.762Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: git-retry-design-necessity-multi-agent-sessions-amplify-inde-4ca82e4f
    type: explains
memoryVersion: 1
---
## Observation

Git index.lock errors are occurring frequently during mnemonic operations. Process inspection reveals zombie git processes.

## Evidence

**Process state showing git zombies**:

```text
danielmarbach    73301   0.0  0.0        0      0 s001  ?+    3:00PM   0:00.00 (git)
danielmarbach    73288   0.0  0.0        0      0 s001  ?+    3:00PM   0:00.00 (git)
```

The `?+` state indicates zombie/terminated processes whose parent hasn't reaped them.

## Likely Causes

### 1. Parallel Operations

From parallel consolidate operations note:

- Four consolidate.execute-merge operations launched in parallel
- Concurrent git operations on same vault cause lock contention
- Even with retry logic, rapid parallel operations overwhelm git's single-threaded index

### 2. Process Lifecycle Issues

Zombie processes suggest:

- Git subprocess spawned by simple-git not properly awaited
- Parent process (node/mnemonic) doesn't call waitpid() to reap child
- Index.lock held until parent cleans up zombies
- In Node.js async contexts, this can happen if git processes are spawned without proper cleanup handlers

### 3. Tool Pattern: Back-to-Back Commits

Many mnemonic operations follow pattern:

1. Write/deletion mutation
2. git.add([...files...])
3. git.commit()
4. git.push() (possibly)

When operations complete quickly (milliseconds), subsequent operations may try git.add() before previous git process fully releases index.lock.

### 4. Multiple MCP Server Instances

Process list shows:

- Homebrew mnemonic install (0.11.1)
- Local dev mnemonic
- VSCode's tsserver

Multiple instances accessing same repo concurrently.

## Why It's Worse Than Expected

Git's index is single-writer:

- Only one process can hold index.lock at a time
- Lock acquisition is not queued fairly
- Rapid successive operations cause contention
- Zombie processes hold lock until reaped

Node.js git libraries (simple-git) spawn child processes:

- Default behavior may not properly await process cleanup
- Async context switches can leave processes dangling
- No built-in retry for index.lock acquisition

## Evidence Supporting Zombie Theory

1. Process state `?+` = zombie/defunct
2. Lock file exists but no active git process holding it
3. Lock persists until OS or parent cleans up
4. Common issue with child_process.spawn() without proper cleanup

## Recommendations

### Short-term

- Document parallel vault operations should be avoided
- Add retry with exponential backoff for git.add() in commitWithStatus()
- Consider wrapping entire git operation block with retry

### Medium-term

- Investigate simple-git process lifecycle management
- Ensure all git operations are properly awaited
- Add cleanup handlers for spawned processes
- Consider lock file timeout detection

### Long-term

- Implement vault-level operation serialization
- Add operation queue per vault to prevent concurrent git ops
- Consider git worktrees for parallel operations

## Related Issues

This compounds with retry contract gap:

- Zombie processes cause index.lock
- Lock during git.add() (not git.commit())
- Current retry doesn't cover git.add()
- Result: failed operations leave staged changes

## Next Investigation Steps

1. Monitor: After git.lock error, check for zombie processes
2. Reproduce: Run parallel mutating operations intentionally
3. Measure: How often do zombies appear vs active lock contention?
4. Test: Does adding process cleanup reduce lock frequency?

## Incident Frequency Pattern

Not random - correlates with:

- Rapid successive MCP calls
- Multiple tool invocations in quick succession
- Parallel operations
- Multiple mnemonic instances
- Git operations completing in <100ms
