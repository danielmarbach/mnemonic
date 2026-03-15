---
title: 'Label system next steps: incremental implementation'
tags:
  - plan
  - implementation
  - phase-1
  - discover_tags
lifecycle: temporary
createdAt: '2026-03-15T13:34:36.947Z'
updatedAt: '2026-03-15T13:34:36.947Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
## Incremental Implementation Plan

### Phase 1: Tag Discovery Without Embeddings

Goal: Help LLM see existing tags before creating new ones

Implementation:

- Add `discover_tags` tool that extracts all tags from project vault
- Return sorted by usage count with example note titles
- Include lifecycle type (temporary vs permanent)

Workflow change:

- Before calling `remember`, agent calls `discover_tags` first
- LLM reviews existing tags and either picks one or creates new
- Reduces fragmentation from "bug/bugs/bugfix"

Cost: 2-3 hours of implementation

### Phase 2: Semantic Tag Embeddings

Goal: Enable semantic tag matching

Implementation:

- Store tag embeddings separately from note embeddings
- When writing note, suggest tags based on semantic similarity
- Small index: typically 50-200 tags per project

Benefit:

- Suggests "testing" when you mention "QA"
- Finds related concepts across different terminology

Cost: 4-6 hours

### Phase 3: Structured Taxonomy Guidelines

Goal: Provide category hints for specific project types

Implementation:

- Add optional taxonomy field to project memory policy
- Categories like "Architecture", "Quality", "Process"
- Each category has suggested tag list

Benefit:

- Guides new team members
- Consistent vocabulary across project

Cost: 2-3 hours

## Trade-offs

Current approach: Simple but relies on "luck" - consistent terminology across sessions

Phase 1 only: Better consistency, minimal complexity, no embeddings

Phases 1+2: Best balance - semantic discovery, still simple

All phases: Most structure but risks over-engineering

## Recommendation

Start with Phase 1. Build `discover_tags` tool and update workflow. Dogfood for a week to measure tag fragmentation reduction, then decide on Phase 2 based on results.
