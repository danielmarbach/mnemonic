---
title: Temporal Interpretation Strategy
tags:
  - design
  - temporal
  - phase-8
  - classification
  - mnemonic
lifecycle: permanent
createdAt: '2026-03-28T15:21:34.137Z'
updatedAt: '2026-03-28T15:33:46.926Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: why-default-temporal-mode-avoids-raw-diffs-5a606840
    type: related-to
memoryVersion: 1
---
# Temporal Interpretation Strategy

Mnemonic's temporal mode now explains what kind of change happened to a note, not just that a change occurred.

## How It Works

When using `mode: "temporal"` during recall, each history entry is enriched with:

- **changeCategory**: One of `create`, `refine`, `expand`, `clarify`, `connect`, `restructure`, `reverse`, `unknown`
- **changeDescription**: Human-readable description like "Expanded the note with additional detail"
- **historySummary**: Overall pattern summary like "The core decision remained stable while rationale expanded"

## Classification Strategy

Categories are determined using structural and statistical signals:

- **create**: First commit for the note or high additions with no prior history
- **refine**: Small additions/deletions, low churn, repeated small edits
- **expand**: Additions significantly outweigh deletions, content grew materially
- **clarify**: Small-to-moderate changes with low net growth, improves wording
- **connect**: Relationship links changed, note linked to other notes
- **restructure**: Both additions and deletions substantial, high churn
- **reverse**: Strong evidence of prior content replaced (used conservatively)
- **unknown**: Fallback when confidence is low

## Design Principles

1. **Language-independent**: Works for any note text, not just English
2. **Structural signals first**: Uses commit stats, file changes, relationships
3. **Wording cues optional**: Commit messages help but aren't required
4. **Bounded output**: Never includes raw diffs
5. **Fail-soft**: If interpretation fails, basic history still works
6. **Post-processing**: Enrichment happens after Phase 2 history retrieval

## Trade-offs

- Conservative classification avoids mislabeling changes
- Semantic interpretation over raw patches prioritizes understanding over detail
- Categories are coarse-grained to work across domains
- Heuristics-based rather than ML to avoid English-only assumptions
