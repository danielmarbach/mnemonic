---
title: 'Dogfooding results: working-state continuity pack (2026-04-17)'
tags:
  - dogfooding
  - testing
  - scorecard
  - workflow
  - temporary-notes
lifecycle: permanent
createdAt: '2026-04-17T13:25:38.932Z'
updatedAt: '2026-04-17T13:25:38.932Z'
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
## Pack B — Working-state continuity (2026-04-17)

Mnemonic v0.23.0, run against live project vault (78 notes).

### Test results

- W1 Orientation first: **Pass** — Summary provides useful starting point (confirmed in Pack A)
- W2 Temporary recovery via recall: **Pass** — No project temporary notes exist currently; correct empty result. Cross-project temporary in main-vault correctly excluded.
- W3 Temporary recovery via recent: **Pass** — Only returns main-vault temporary from different project; no false positives
- W4 Guidance alignment: **Pass** — Workflow hint: "project_memory_summary first (do not skip to recovery)", "let lifecycle defaults delete temporary scaffolding"
- W5 Lifecycle distinction: **Pass** — Clear separation: temporary = plans/WIP/drafts; permanent = decisions/constraints/lessons
- W6 Consolidation behavior: **Pass** — No push toward preserving temporary scaffolding by default
- W7 End-to-end resume flow: **Pass** — Summary then (no temporaries) then continue. Flow feels coherent, not parallel.

### Scorecard

- [x] summary-first orientation still holds
- [x] recall(lifecycle: temporary) is useful
- [x] recent_memories(lifecycle: temporary) is useful
- [x] workflow hint matches the design
- [x] lifecycle distinction stays clear
- [x] temporary scaffolding is not preserved by default
- [x] end-to-end resume flow feels coherent

### Notes

- No active temporary checkpoints exist in the mnemonic project vault during this run. The "useful" rating for W2/W3 is based on correct behavior (empty when nothing to recover, no cross-project leakage) rather than actual recovery utility.
- Pack C (blind interruption/resumption) was not executed — it requires a two-session split which cannot be done in a single dogfooding session.
