---
title: 'RPIR outcome: recall derived-scope gating shipped in 0.44.0'
tags:
  - workflow
  - summary
  - recall
  - scope
  - gating
  - release
lifecycle: permanent
createdAt: '2026-08-30T10:18:48.087Z'
updatedAt: '2026-08-30T10:18:52.444Z'
role: summary
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: derived-default-scope-for-recall-project-anchored-precision-98164deb
    type: related-to
memoryVersion: 1
---
RPIR workflow for "smarter default scoping for recall and read tools" completed; shipped in 0.44.0 (squashed to main as PR #343). Design lives in `derived-default-scope-for-recall-project-anchored-precision-98164deb`.

## Shipped

- Derived default scope with project-anchored precision (see decision note).
- Structured diagnostics `suppressedGlobalCount` + `widenedScope` (RecallResult) with .describe() + Returns bullets + schema-parse tests, honoring the implementation-principles structured-output parity contract.
- Missing-cwd hints on recall/list/recent_memories/memory_graph + get/update/forget/where_is_memory not-found; consequence-oriented projectParam description.
- Explicit scope `global` location-based across lexical/graph channels (was inconsistent with the semantic channel; matches the repo-you-don't-own contract, vault-routing test :379).
- Dogfood Pack A observations (derived-scope recall, missing-cwd hint); docs synced (README, AGENT.md, homepage, CHANGELOG 0.44.0).

## Review rounds

1. Orchestrator TS-skill pass: clean; get.ts empty-line smell flagged.
2. Fresh-context adversarial (session model): 14/14 constraints PASS, full verification green (1501 tests); 3 P2 items - graph-evidence flag clearing + get.ts guard applied, minSimilarity hardening rejected (see decision note).
3. Fresh-context design-conformance (openai-codex/gpt-5.6-terra): design 8/8 PASS; blocked on implementation principles (structured parity, hint coverage, docs sync, test cast) - all fixed in commit 7367fea; final verification 87 files / 1502 tests, contract snapshot updated.

## Deviations recorded

- Both flash (ollama/glm-5.3-flash:cloud) implementation runs hung on the provider endpoint; orchestrator completed the work inline per RPIR deviation rules.
- Terra reviewer environment could not execute commands; verification ran fresh by the orchestrator.
- Rebase duplicated the 0.43.0 CHANGELOG heading; retitled the block to 0.44.0 before the bump.
- 1Password SSH-signing agent outage blocked vault commits mid-consolidation; recovered after unlock, one duplicate decision note forgotten.

## Deferred

- collectLexicalRescueCandidates dead code (pre-existing) - left in place (minimal diff).
