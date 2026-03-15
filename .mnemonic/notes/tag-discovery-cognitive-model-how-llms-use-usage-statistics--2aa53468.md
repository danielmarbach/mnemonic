---
title: >-
  Tag discovery cognitive model: how LLMs use usage statistics for accurate
  selection
tags:
  - cognitive-model
  - discover_tags
  - pattern-matching
  - llm-behavior
lifecycle: permanent
createdAt: '2026-03-15T13:47:29.424Z'
updatedAt: '2026-03-15T13:47:29.424Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
## Pattern Matching Over Deep Understanding

discover_tags provides context, not rules. The LLM uses usage statistics and examples to pattern-match what "good tagging" looks like in the project, rather than deeply understanding semantic nuances.

## Information Hierarchy (Most to Least Useful)

### 1. Usage Count (Primary Signal)

Shows canonical vs fringe terminology:

- `bug` (12 uses) vs `bugs` (2 uses) → `bug` is standard
- High count = established project vocabulary
- Low count = personal preference or mistake

### 2. Example Note Titles (Semantic Anchors)

Provides concrete patterns to match against:

- Example: "ci-create-release checkout fails fetching tag-ref over https"
  - Tagged: `[ci, github-actions, bug, release]`
- LLM pattern-matches: "My note is about a CI checkout bug → use those tags"
- 2-3 examples enough to establish pattern

### 3. Lifecycle Types (Quality Signal)

Temporary vs permanent distribution:

- Permanent-only = durable knowledge, important tags
- Temporary-mix = scaffolding, planning, WIP
- Helps distinguish `plan` from `decision` tags

### 4. IsTemporaryOnly (Cleanup Indicator)

Tags used only on temporary notes are cleanup candidates:

- Suggests tag didn't mature into project vocabulary
- Helps avoid creating similar low-value tags

## Cognitive Model: How LLM Makes Decisions

**Scenario**: User fixing CI bug

**Before discover_tags**:

1. User: "Fix tag-ref HTTPS failure"
2. LLM guesses: `[bug, ci]` maybe? Or `[bugs, ci]`? Or `[bug, github-actions]`?
3. Result: Near-duplicates, inconsistency

**After discover_tags**:

1. LLM calls discover_tags()
2. Sees: `bug` (12 uses), `bugs` (2 uses) → picks `bug`
3. Sees: `ci` used with `github-actions` for CI bugs → uses both
4. Sees example "ci-create-release checkout fails..." → matches pattern
5. Suggests: `[ci, github-actions, bug, release]` (informed choice)

## Why It's "Accurate Enough"

✅ Shows actual usage, not theoretical taxonomy  
✅ Provides concrete examples for pattern matching  
✅ Surfaces canonical terms via usage count  
✅ Reveals co-occurrence clusters (what tags appear together)  
✅ Distinguishes durable knowledge from scaffolding  

The LLM's strength is pattern recognition, not semantic reasoning. discover_tags shows the LLM what good tagging looks like in this specific project, and the LLM pattern-matches against those examples.

## Example Output Analysis

```json
{
  "tag": "ci",
  "usageCount": 8,
  "examples": [
    "ci-create-release checkout fails fetching tag-ref over https",
    "ci-safe MCP integration and failure learning workflow",
    "GitHub Packages publishing and CI workflow"
  ],
  "lifecycleTypes": ["permanent"],
  "isTemporaryOnly": false
}
```

What LLM learns:

- `ci` is canonical (8 uses, high confidence)
- It's for GitHub Actions infrastructure (examples show workflows)
- It's serious/permanent (not temporary scaffolding)
- Use it for: CI failures, workflow improvements, integration issues

No semantic reasoning needed—just "notes like this use this tag."
