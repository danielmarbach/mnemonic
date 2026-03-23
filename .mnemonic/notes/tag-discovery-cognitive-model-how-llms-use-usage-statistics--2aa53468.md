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
updatedAt: '2026-03-23T20:43:28.540Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
## Pattern Matching Over Deep Understanding

`discover_tags` should evolve from a corpus-oriented inventory into a note-oriented suggestion tool.

The core cognitive model still holds: the LLM benefits from seeing canonical project vocabulary and a small amount of evidence. But the evidence should be filtered through the specific note being written rather than dumping the whole tag catalog.

## Updated Information Hierarchy

### 1. Note Relevance (Primary Signal)

The most useful tag is the one that matches the note being written, not the one that is merely common across the whole vault.

- A note about MCP prompt wording should prefer `mcp`, `prompt`, `workflow`, or `design` over unrelated but globally common tags
- Relevance should narrow the candidate set before any popularity-based ranking

### 2. Usage Count (Canonicality Signal)

Usage count remains valuable, but as a secondary signal:

- `bug` (12 uses) vs `bugs` (2 uses) still indicates canonical terminology
- High count helps break ties among relevant candidates
- High count alone should not surface unrelated tags

### 3. Example Titles or Short Reasons (Trust Signal)

The LLM only needs a little evidence to trust a suggestion:

- one short example title or a brief reason is usually enough
- this keeps responses compact while still grounding the suggestion in real project usage

### 4. Lifecycle Distribution (Quality Signal)

Temporary-only tags are still useful as a warning signal:

- permanent-heavy tags imply durable vocabulary
- temporary-only tags should be demoted unless the target note is also temporary

## Updated Cognitive Model

**Before the shift**:

1. LLM calls `discover_tags()`
2. Sees a broad tag inventory with usage counts and examples
3. Infers which tags are probably relevant
4. Risks distraction from many unrelated tags and large payloads

**After the shift**:

1. LLM calls `discover_tags()` with note context
2. Tool narrows candidates to tags relevant to that note
3. Tool boosts canonical tags by usage count
4. Tool returns a compact ranked list plus minimal evidence
5. LLM chooses from a smaller, more trustworthy set

## Why This Better Serves the Original Goal

The original goal was not to expose every existing tag. It was to help the LLM avoid inventing or overusing unrelated tags.

A note-oriented `discover_tags` serves that goal better because it:

- reduces irrelevant tags in context
- preserves canonical vocabulary signals
- keeps payload size manageable
- still gives enough evidence for confident pattern matching

The LLM's strength is still pattern recognition, not deep semantic reasoning. The improvement is that pattern matching now happens over a relevant candidate set instead of the entire tag corpus.
