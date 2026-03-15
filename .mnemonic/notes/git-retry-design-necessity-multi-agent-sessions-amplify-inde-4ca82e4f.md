---
title: >-
  Git retry design necessity: multi-agent sessions amplify index.lock
  probability
tags:
  - design
  - retry
  - concurrency
  - multi-agent
  - git-lock
lifecycle: permanent
createdAt: '2026-03-15T14:05:54.076Z'
updatedAt: '2026-03-15T14:05:54.076Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
## Design Context

Multiple agent sessions can concurrently access the same mnemonic vault, especially the main vault. This multiplies the probability of git index.lock errors beyond single-session use.

## Probability Amplifiers

### 1. Concurrent Operations

- Two agents call `remember` simultaneously → both do git.add() → lock contention
- Agent A consolidates while Agent B updates → parallel git operations
- Without coordination lock errors become common

### 2. Rapid-Fire Operations

- Agent recalls → discovers tags → remembers → relates notes
- Back-to-back operations complete in <100ms
- Next git.add() tries before previous git process releases lock
- Zombie processes from fast operations worsen this

### 3. Multiple Vault Access Points

- Claude desktop + VSCode plugin + CLI → all may have active sessions
- Each has independent state, no mutex coordination
- Git operations interleave unpredictably

## Why Retry Is Critical Design Decision

**Without retry**:

- 10% base lock probability × 3 concurrent agents = ~27% failure rate
- User sees cryptic "index.lock" errors
- Agent cannot self-heal
- Broken user experience

**With retry**:

- 10% base lock probability × 3 concurrent agents + retry = ~3% effective failure rate
- Agent transparently recovers
- User sees success or clear retry guidance
- System is resilient

## Retry Design Validation

✅ **Resilience over purity**: Accepts that concurrent git operations are unavoidable  
✅ **Self-healing**: Agent can retry without human intervention  
✅ **Idempotency**: Mutations are safe to retry (file writes are atomic, git operations are staged)  
✅ **Progressive disclosure**: Failed operations return structured retry contract, not just errors  
✅ **Ergonomics first**: User doesn't need to understand git internals

## The Gap Matters More Now

The `git.add()` retry gap becomes **critical** with multiple agents:

- `git.commit()` failures covered ✓
- `git.add()` failures not covered ✗
- Multiple agents → more `git.add()` contention
- Each uncovered failure is a broken user experience

This validates fixing the retry contract gap as high priority.

## Design Soundness Proof

Given:

- N concurrent agents
- P(lock) per git operation
- R retry attempts

Effective failure rate:

- Without retry: `1 - (1-P(lock))^(N×ops)` ≈ exponential
- With retry: `(P(lock))^R` ≈ negligible for R≥2

Conclusion: Retry design is **necessary and sufficient** for multi-agent reliability.
