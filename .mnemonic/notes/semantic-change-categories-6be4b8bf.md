---
title: Semantic Change Categories
tags:
  - design
  - temporal
  - phase-8
  - categories
  - mnemonic
lifecycle: permanent
createdAt: '2026-03-28T15:21:53.814Z'
updatedAt: '2026-03-28T15:33:46.926Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: temporal-interpretation-strategy-f8573d1d
    type: explains
memoryVersion: 1
---
# Semantic Change Categories

Mnemonic uses eight change categories to classify temporal history entries.

## The Categories

**create** - New note created. Used when first commit or high additions with no prior history.

**refine** - Minor improvements. Used for small edits, low churn, repeated tweaks over time.

**expand** - Added content. Used when additions significantly outweigh deletions and content grew materially.

**clarify** - Better explanation. Used for small-to-moderate changes improving wording and constraints.

**connect** - Linked to other notes. Used when relationship links changed or note was linked to related work.

**restructure** - Reorganized content. Used when both additions and deletions are substantial with high churn.

**reverse** - Direction changed. Used only with strong evidence that prior content was contradicted. Used conservatively and rarely.

**unknown** - Uncertain. Fallback when confidence is low or signals are insufficient.

## Classification Logic

Categories are assigned using deterministic heuristics:

1. Metadata prefixes in commit messages like relate: or move: indicate connect
2. First commit in history is create
3. Zero content changes means connect if relationships changed otherwise unknown
4. Small changes under 10 lines with low churn is refine
5. Net growth where additions exceed deletions times two is expand
6. High churn over 50 lines or substantial update type is restructure or expand
7. Medium changes between 10-50 lines is clarify or refine or expand based on churn ratio

## Design Constraints

Categories must work for non-software notes. Classification cannot depend on English words. Must distinguish evolution patterns from contradictions. Prefer unknown over misclassification.
