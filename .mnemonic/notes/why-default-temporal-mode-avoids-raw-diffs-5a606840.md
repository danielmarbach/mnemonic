---
title: Why Default Temporal Mode Avoids Raw Diffs
tags:
  - design
  - temporal
  - phase-8
  - diffs
  - mnemonic
lifecycle: permanent
createdAt: '2026-03-28T15:21:34.139Z'
updatedAt: '2026-03-28T15:33:46.927Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: temporal-interpretation-strategy-f8573d1d
    type: related-to
memoryVersion: 1
---
# Why Default Temporal Mode Avoids Raw Diffs

## Core Principle

Temporal mode explains change compactly and meaningfully without exposing raw diffs by default.

## Rationale

Raw diffs are:

- **Noisy**: Line-by-line changes obscure the semantic meaning
- **Unbounded**: Can be arbitrarily large
- **Context-dependent**: Require understanding of the codebase to interpret
- **Language-specific**: Patch formats assume software projects

Users typically want to know:

- "What changed here?"
- "Did this decision change or get refined?"
- "How did this note evolve?"

Not:

- "Show me every line that changed"

## What Temporal Mode Shows Instead

Each history entry includes:

- Commit hash, timestamp, message
- Summary of additions/deletions
- **changeDescription**: Semantic interpretation (e.g., "Clarified constraints")
- **changeCategory**: Classification of change type
- **historySummary**: Overall evolution pattern

This is interpretive, not mechanical.

## When Raw Diffs Are Appropriate

Raw diffs may be useful for:

- Debugging storage issues
- Auditing specific line changes
- Migration validation

These are advanced use cases, not default behavior.

## Future Considerations

A future `verbose: "diffs"` mode could expose raw patches if explicitly requested. Default temporal mode will remain bounded and semantic.
