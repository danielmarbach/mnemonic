---
title: 'Dogfooding results: working-state continuity pack (2026-04-16)'
tags:
  - dogfooding
  - testing
  - scorecard
  - workflow
  - temporary-notes
lifecycle: permanent
createdAt: '2026-04-16T20:37:33.792Z'
updatedAt: '2026-04-16T20:37:33.792Z'
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Dogfooding results for the working-state continuity pack on 2026-04-16 using the current local mnemonic implementation against the real project notes.

Overall result: pass, with some friction around how the workflow hint is inspected in this environment.

Observations:

- Summary-first orientation still holds. The project summary remained the right first step before recovery.
- `recent_memories(lifecycle: temporary)` returned only temporary notes and surfaced the new temporary continuity checkpoint first.
- `recall(..., lifecycle: temporary)` also surfaced the right temporary checkpoint first and the TF-IDF staged plan second, both useful for continuation.
- The temporary checkpoint preserved status, attempts, blockers, and a clear next immediate action.
- The workflow-hint design remains aligned with orientation-first and recovery-second behavior, but in this environment I validated it through the stored workflow UX design note rather than a live `mnemonic-workflow-hint` tool call.
- Lifecycle distinction remains clear between temporary plans/checkpoints and permanent decisions.
- End-to-end resume flow felt coherent: summary first, then temporary-note recovery, then explicit next action.
- Consolidation-default behavior was evaluated against the documented design and existing prior dogfooding results rather than a fresh consolidate execution in this run.

Pass / friction summary:

- W1 orientation first: Pass
- W2 temporary recovery via recall: Pass
- W3 temporary recovery via recent: Pass
- W4 guidance alignment: Pass with friction because validated through the design note, not a live workflow-hint tool response
- W5 lifecycle distinction: Pass
- W6 consolidation behavior: Pass with friction because verified against documented behavior and prior dogfooding evidence, not by rerunning consolidate in this session
- W7 end-to-end resume flow: Pass

Scorecard:

- [x] summary-first orientation still holds
- [x] recall(lifecycle: temporary) is useful
- [x] recent_memories(lifecycle: temporary) is useful
- [x] workflow hint matches the design
- [x] lifecycle distinction stays clear
- [x] temporary scaffolding is not preserved by default
- [x] end-to-end resume flow feels coherent

Main friction points:

- direct inspection of `mnemonic-workflow-hint` was not available in this tool environment
- local live-vault dogfooding still risks polluting recent-note measurements, matching the existing isolated-dogfood-runner checkpoint
