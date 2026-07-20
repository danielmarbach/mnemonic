---
title: 'Plan: one-shot bounded RRF hybrid recall alignment'
tags:
  - workflow
  - plan
  - rrf
  - recall
  - ranking
  - hybrid-search
lifecycle: temporary
createdAt: '2026-07-20T16:18:34.107Z'
updatedAt: '2026-07-20T16:18:34.107Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Implement one coherent recall-ranking change, preserving mnemonic's file-first and semantic-first product constraints while making retrieval channels materially RRF-correct.

- [ ] Keep semantic retrieval bounded by the existing embedding/minSimilarity path and preserve temporal filtering, metadata, and project context behavior.
- [ ] Add an always-on bounded lexical channel over existing compact projection text; reuse existing TF-IDF preparation/rescue primitives where practical, exclude already-semantic candidates only for candidate generation, and fail soft to semantic recall.
- [ ] Keep graph expansion as bounded semantic-conditioned expansion, but give it an explicit independent graph rank and preserve semantic rank/score without contamination.
- [ ] Replace raw semantic magnitude as the fusion backbone with pure three-channel RRF plus an explicitly bounded semantic-confidence prior; retain bounded metadata/temporal/canonical policy adjustments and document their maxima.
- [ ] Enforce deterministic channel and final ordering with stable note-id tie breaks and make rank-window behavior suppress out-of-window channel evidence without a raw-score fallback.
- [ ] Preserve current-project preference only as a bounded policy adjustment; do not allow hard project-first selection to routinely overturn retrieval consensus.
- [ ] Expose optional compact score decomposition/rank diagnostics without changing default response verbosity or introducing persistence.
- [ ] Update unit and integration tests for lexical-only admission, multi-channel consensus, missing channels, calibration invariance, rank windows, deterministic ties, graph non-contamination, project policy, and schema/text compatibility.
- [ ] Run build, targeted tests, full tests, lint, and local MCP/dogfood validation; report pre-existing lint failures separately.

Constraints: no database, daemon, synced index, raw-note lexical scan beyond existing bounded projection path, new cold-path I/O where avoidable, or breaking default output shape. Existing optional fields remain backward compatible.

Self-check: each research requirement maps to an executable checklist item; no placeholders remain.
