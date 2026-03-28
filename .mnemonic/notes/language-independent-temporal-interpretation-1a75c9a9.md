---
title: Language-Independent Temporal Interpretation
tags:
  - design
  - temporal
  - phase-8
  - language
  - mnemonic
  - i18n
lifecycle: permanent
createdAt: '2026-03-28T15:21:46.984Z'
updatedAt: '2026-03-28T15:33:46.927Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: temporal-interpretation-strategy-f8573d1d
    type: explains
memoryVersion: 1
---
# Language-Independent Temporal Interpretation

## Core Requirement

Temporal interpretation must work reasonably even when note text is not English.

## Why This Matters

Users may write notes in any language. Classification that only works for English fails for international teams, non-English documentation, codebases with non-English comments, and assumes specific vocabulary patterns.

## What Is Language-Independent

Primary signals (used for all classifications):

- Relative additions vs deletions
- Size of change
- Whether relationship edges changed
- Whether note appears newly created
- Repeated small edits vs high churn

Optional weak signals (may help but not required):

- Commit message wording
- Title wording
- English text cues in the note

## What Is NOT Language-Dependent

The classifier does NOT:

- Parse English verbs in commit messages
- Look for specific keywords like "fix" or "refactor"
- Assume English sentence structure
- Require English headings or section names

## Examples

Italian commit "Aggiunto nuovo esempio" - classified as expand because additions outweigh deletions. Language does not matter.

Chinese commit "修复了错误" - classified as refine because small change, low churn. Language does not matter.

Japanese commit "更新" - classified as unknown or inferred from stats because generic message, rely on structural signals.

## Testing for Language Independence

- Test with non-English commit messages
- Verify classification matches expected category
- Ensure wording signals are optional
