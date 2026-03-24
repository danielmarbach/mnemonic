---
title: 'Tag discovery: design, note-oriented pivot, and cognitive model'
tags:
  - discover_tags
  - architecture
  - design
  - decision
lifecycle: permanent
createdAt: '2026-03-24T10:55:45.308Z'
updatedAt: '2026-03-24T10:55:45.308Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
## Original design goals

`discover_tags` exists to prevent agents from inventing or overusing unrelated tags by exposing the project's canonical tag vocabulary with usage evidence.

## Pivot: note-oriented ranked suggestions (default)

The original corpus-oriented design returned the full tag inventory, which was too verbose and exposed many unrelated tags.

**Current default behavior:** caller provides note context (`title`, `content`, or `query`) → tool returns a compact ranked list of canonical suggestions for that specific note.

**Ranking order:**
1. Note relevance (primary) — exact tag-name matches and token overlap with note context
2. Usage count (secondary) — canonicality signal; high count breaks ties among relevant candidates
3. Lifecycle distribution — temporary-only tags demoted unless target note is also temporary

**`mode: "browse"`** opts into the broader corpus-wide inventory output. Explicit, not default.

## Specificity-first rule

- Exact tag-name match in note context → wins over broad high-frequency tags
- Token overlap and note-context overlap outrank raw popularity
- When no strong specific candidate exists, fall back toward broad canonical tags (not a full dump)
- The specificity branch only fires on genuinely specific matches, not weak lexical overlap

## Cognitive model

LLMs benefit from pattern matching over a relevant candidate set, not over the entire tag corpus.

**Before:** `discover_tags()` → broad inventory → LLM infers relevance → risk of distraction from many unrelated tags + large payload

**After:** `discover_tags(note context)` → tool narrows to relevant candidates → boosts by usage count → compact ranked list + minimal evidence (one short example title per tag is enough) → LLM chooses from a small, trustworthy set

## Performance design

- Tag index built lazily and cached within the request
- Avoids full vault re-scan on each call
- Embedding similarity used for relevance ranking only when lexical signal is weak
- Bounded output regardless of vault size

## Generalization rule

The specificity heuristic must not overfit to any one project's tag distribution:
- A clearly specific exact match wins even if the tag appears only once in a sparse project
- Generic prompts fall back to broad canonical tags, not niche one-off tags
- Specificity-heavy ranking only triggers for exact matches that are genuinely specific
