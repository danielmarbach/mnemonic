---
title: 'Theme refinement design: emergent themes and graduation'
tags:
  - architecture
  - themes
  - design
lifecycle: permanent
createdAt: '2026-03-26T11:28:51.171Z'
updatedAt: '2026-03-26T11:28:51.171Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
## Emergent themes

Themes emerge from keyword frequency across notes, not from a predefined taxonomy.

## Graduation rules

A keyword graduates from "other" to a named theme when:

- Appears in ≥ 3 different notes (minKeywordFrequency defaults to 3)
- Is not in the GENERIC_TERMS rejection list
- Is not in STOPWORDS

Fixed themes come first: notes with matching tags (overview, decisions, tooling, bugs, architecture, quality) are classified by those tags. Only notes in "other" are considered for keyword-based graduation.

## Keyword extraction

`extractKeywords(note)` extracts from:

- Title words
- Tags
- First 200 characters of content (summary-like)

Synonyms are normalized via `normalizeKeyword()` using a small general-purpose dictionary. Keywords are deduplicated while preserving order.

## Theme assignment order

1. Tag-based classification (`classifyTheme`) — matches tags to fixed themes
2. Keyword-based graduation (`classifyThemeWithGraduation`) — matches keywords to promoted themes
3. Falls back to "other"

`computeThemesWithGraduation(notes)` does batch analysis: counts keyword frequencies, identifies candidate themes, assigns themes to all notes.

`classifyThemeWithGraduation(note, promotedThemes)` does single-note classification against a precomputed Set of promoted themes.

## Validation thresholds

Theme quality (`analyzeThemeQuality`):

- Good "other" ratio: < 25%
- Acceptable: 25-40%
- Needs improvement: > 40%

Warnings:

- High "other" ratio (> 40%)
- Moderate "other" ratio (25-40%)
- Too many single-note themes (≥ 3)
- Skewed distribution (one theme > 60%)

## Stability

Themes are computed fresh on each call. No persistent state between runs.
Graduation is deterministic: same notes → same themes.

## Language handling

The system degrades gracefully for non-English notes:

- STOPWORDS and SYNONYMS are optional enhancements (English-specific)
- Keywords that don't match pass through unchanged
- Non-English keywords can still graduate if they meet frequency thresholds
- Tags and headings are language-neutral signals
