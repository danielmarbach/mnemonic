---
title: 'Derived default scope for recall: project-anchored precision'
tags:
  - recall
  - scope
  - gating
  - design
  - decision
lifecycle: permanent
createdAt: '2026-08-30T10:01:18.662Z'
updatedAt: '2026-08-30T10:18:31.162Z'
role: decision
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: implementation-principles-for-mnemonic-mcp-2e178bba
    type: related-to
memoryVersion: 1
---
recall keeps `all` as the derived default, but when cwd resolves a project and no explicit `scope` was passed, weakly-matching unassociated main-vault global semantic candidates are held back (`subBarGlobal`) unless curated (`alwaysLoad: true` explicit), strongly matching (rawScore >= minSimilarity + GLOBAL_BAR_DELTA 0.15), or admitted via lexical-exact or graph-linked evidence (graph spreading clears the flag). An empty admitted pool (notes AND document chunks) lifts back to the full set. Suppression and widening are reported in text AND structured output (`suppressedGlobalCount`, `widenedScope`), satisfying the structured-output parity contract. Explicit scopes never gate. Missing-cwd hints appear on all read tools and id-tool not-found responses; explicit scope `global` is location-based (main vault) across all channels.

## Why

The weaving goal (global common rules weave into project context) ruled out a hard project-scoped default. The July RRF decision ruled out hard project-first ranking. Gating weak-global admission preserves both: curated/strong/linked globals weave in; weak noise does not displace project results.

## Rejected alternatives

- Hard default scope `project`: violates the weaving goal (user-rejected).
- Fill-the-limit heuristic (Mar-2026 note, no longer in vault): superseded by the RRF bounded-prior decision; do not reintroduce the language in docs.
- minSimilarity hardening (bar clamp at 1.0 or rawScore >= 0.5 exemption): REJECTED - the fake embedding server stages all similarities at 1.0 with GATING_MIN_SIMILARITY 0.9, deliberately exercising a bar above 1.0; a high minSimilarity is caller-explicit and mitigated by lift + suppression notice + explicit scope `all`.
- Server-side cwd detection: MCP listRoots deprecated (SEP-2577); env pinning breaks multi-project; guessing risks cross-project contamination. In-band hints instead.
- importance `high` as curation exemption: not tool-settable today (inferred only); alwaysLoad is the deliberate signal.
