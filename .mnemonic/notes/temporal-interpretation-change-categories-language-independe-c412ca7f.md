---
title: >-
  Temporal interpretation: change categories, language independence, and no raw
  diffs
tags:
  - design
  - temporal
  - phase-8
  - language
  - mnemonic
  - i18n
  - categories
  - classification
  - diffs
lifecycle: permanent
createdAt: '2026-09-27T20:54:39.145Z'
updatedAt: '2026-09-27T20:54:39.145Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: verbose-flag-must-not-gate-pipeline-inputs-only-output-filte-e65e1afc
    type: related-to
memoryVersion: 1
---
## Consolidated from:
### Language-Independent Temporal Interpretation
*Source: `language-independent-temporal-interpretation-1a75c9a9`*

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

### Semantic Change Categories
*Source: `semantic-change-categories-6be4b8bf`*

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

### Temporal Interpretation Strategy
*Source: `temporal-interpretation-strategy-f8573d1d`*

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

### Why Default Temporal Mode Avoids Raw Diffs
*Source: `why-default-temporal-mode-avoids-raw-diffs-5a606840`*

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

### Language-Independent Temporal Interpretation
*Source: `language-independent-temporal-interpretation-1a75c9a9`*

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

### Temporal Interpretation Strategy
*Source: `temporal-interpretation-strategy-f8573d1d`*

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
