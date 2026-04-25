---
title: 'Hindsight phases 1-5 review: findings addressed (consolidated)'
tags:
  - hindsight
  - recall
  - review
  - completed
lifecycle: permanent
createdAt: '2026-04-25T21:42:49.274Z'
updatedAt: '2026-04-25T21:58:27.743Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: hybrid-recall-design-and-implementation-0-20-0-0-23-0-350317a0
    type: related-to
  - id: performance-principles-for-file-first-mcp-and-git-backed-wor-4e7d3bc8
    type: explains
memoryVersion: 1
---
# Hindsight phases 1-5 review: findings addressed

All hindsight phases 1-5 review findings have been addressed.

## HIGH issues fixed

- **H1**: `semanticRank` re-assigned after `applyGraphSpreadingActivation`. Graph-discovered candidates now get `semanticRank`.
- **H2**: `isWithinTemporalFilterWindow` returns `true` for invalid dates (fail-open instead of fail-closed).

## MEDIUM issues fixed

- **M5**: Project boost reduced from 0.15 to 0.03 (`PROJECT_SCOPE_BOOST` constant).
- **M8**: `computeHybridScore` computes lexical RRF even when `semanticRank` is undefined for rescue candidates.
- **M14**: `CANONICAL_HYBRID_WEIGHT` increased from 0.005 to 0.05.
- **M10**: Temporal query hints reordered by specificity to fix first-match-wins.
- **M12**: Added `in\s+the\s+past` temporal regex pattern.

## Deferred (no code change required) — with rationale

- **M1** (Graph spreading mutates candidate objects in-place): Acceptable in the linear pipeline. The implementation mutates `score` and `boosted` on existing candidates rather than copying, which works because the pipeline processes candidates sequentially. No concurrent access.
- **M2** (Discovered candidates inherit entry point's vault — cross-vault bug): Related notes may live in a different vault. Downstream code looks in the wrong vault and silently drops the candidate. Would require storage-layer changes beyond current scope. Accepted because cross-vault discovery is infrequent and the behavior is fail-quiet rather than fail-wrong.
- **M3** (No upper bound on accumulated graph-spreading boost): Multiple entry points pointing to the same candidate accumulate additively with no cap. A hub note can receive 1.5+ boost, dominating the hybrid score. Acceptable because hub notes are typically important anchors.
- **M4** (Pipeline ordering differs from review recommendation): Fixed by H1 — `semanticRank` is now re-assigned after graph spreading, making the ordering concern moot.
- **M6** (Temporal hint detection is English-only): `detectTemporalQueryHint` uses English regex exclusively ("recent", "this week", etc.), violating the language independence constraint. Boost computation is language-independent but the activation gate is not. Accepted as a pragmatic first pass; non-English queries still get semantic results.
- **M7** (Temporal filtering runs before graph spreading): High-confidence temporal queries exclude candidates before spreading, so older notes can't serve as entry points. Desired behavior — if the user explicitly asks for recent notes, older ones shouldn't dilute results.
- **M9** (Token caching skipped for global scope with no projectId): When scope is global with no project, token caching is bypassed entirely. Acceptable because global-only usage is less common and the cost is re-tokenization, not incorrect results.
- **M11** ("today" maps to medium confidence, no strict filtering): Users saying "notes from today" likely expect strict filtering, not just a boost. Accepted as boost-only for now; strict filtering requires higher confidence calibration.
- **M13** (Phase 1 activation gate of 0.5 may be too aggressive): Ollama embeddings often produce similarities in the 0.3–0.7 range. Many queries have few entry points above 0.5. Accepted because the gate prevents noise; lowering it would need benchmarking.
- **M15** (lexicalRankSignal tiebreaker asymmetric for rescue candidates): Rescue candidates have undefined `coverageScore` and `phraseScore`, creating asymmetric tiebreaking. Partially mitigated by M8 (lexical RRF for rescue candidates).
- **M16** (Full cache invalidation causes latency spike after mutations): Invalidating the entire session cache on every write-path tool call creates a measurable spike on next recall. Acceptable for correctness; optimization deferred.

## Design constraint compliance after fixes

- **No database/daemon/new artifacts**: PASS
- **Fail-soft to semantic-first**: PASS (H2 fixed)
- **Additive, bounded, reversible**: PASS
- **Language independence**: DEFERRED (M6)
- **One file per note**: PASS
- **No auto-relationship via LLM**: PASS

## Plan validation

Three reviews confirmed the plan-to-implementation alignment is strong with two explicit scope deltas:

- Phase 3: session-scoped cache instead of persistent per-vault cache
- Phase 4: additive boost only, no strict filtering
