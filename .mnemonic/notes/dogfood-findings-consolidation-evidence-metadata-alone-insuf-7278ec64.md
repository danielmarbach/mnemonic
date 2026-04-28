---
title: >-
  Dogfood findings: consolidation evidence metadata alone insufficient for merge
  decisions
tags:
  - evidence
  - consolidate
  - dogfooding
  - merge-decisions
lifecycle: permanent
createdAt: '2026-04-28T13:09:46.833Z'
updatedAt: '2026-04-28T13:09:46.833Z'
role: research
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
# Dogfood findings: consolidation evidence metadata alone insufficient for merge decisions

Per-note risk calibration restored discriminative power (risk spreads across low/medium/high instead of all-high). But dogfooding against the real project vault reveals that metadata-level evidence cannot answer the actual merge decision question.

## What works

- Risk no longer collapses to all-high: 3 low, 5 medium, 22 high (detect-duplicates at 0.8 threshold)
- Per-note risk differs meaningfully: a temporary research note gets medium while a permanent summary with no warnings gets low
- Warnings identify specific notes: "Summary: evidence enrichment...: lifecycle (permanent) differs from group majority (temporary)"
- Group risk derives from max per-note risk instead of count-based threshold

## What still fails for merge decisions

- 22/30 pairs are still high risk — dense relationship graphs trigger supersedes chain or stale target on most pairs
- "Stale target" reports timestamp age (e.g. "older than 12 sources") but doesn't say whether the older note's content is actually stale or just has an older timestamp
- "Lifecycle mismatch" is informational but not disqualifying — combining temporary research into a permanent summary is a valid and common pattern
- Metadata cannot answer: "should I merge these?" only "what metadata risks exist?"

## What's missing for actionable merge decisions

1. **Content overlap**: How much of the older note's content is already covered by the newer one? Cosine similarity measures semantic closeness, not subsumption direction.
2. **Freshness authority**: Not just timestamps — which note has the canonical/most-complete content?
3. **Relationship impact**: If I merge A into B, what happens to A's relationships? Preserved, lost, or dangling?
4. **Merger direction**: Which note should become the target? Evidence says A is high-risk but doesn't recommend merge direction (A → B vs B → A).

## Analogy

Risk calibration fix = triage vitals. What's needed = diagnosis. Metadata evidence separates safe-from-risky in theory, but the vault's note graph is dense enough that most pairs trigger at least one warning, making the signal-to-noise ratio low for actual decision-making.

## Possible next step

Given a high-similarity pair, show a compact content diff or redundancy summary so the LLM can judge whether notes actually duplicate each other or just share vocabulary. This is a different feature from evidence metadata — it requires reading and comparing note bodies, not just frontmatter fields.
