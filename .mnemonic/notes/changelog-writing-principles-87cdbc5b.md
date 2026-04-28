---
title: Changelog writing principles
tags:
  - changelog
  - documentation
  - conventions
lifecycle: permanent
createdAt: '2026-03-14T13:06:56.354Z'
updatedAt: '2026-04-28T13:20:57.503Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: documentation-split-for-readme-architecture-and-agent-4e20a50b
    type: related-to
memoryVersion: 1
---
# Changelog writing principles

Changelog is a curated, user-focused log of notable changes — not a raw commit log.

## Rules

- Concise: 1-2 sentences max per bullet. Long paragraphs are unreadable.
- User-focused: explain what changed for the user, not how it was implemented. Implementation details (retry logic, internal parameters, function names) belong in commit messages.
- Outcome-first: describe the end result, not the transition. Never "X replaces Y" when Y never shipped.
- No redundancy: if one bullet covers an outcome, don't add more bullets restating the same change at a lower level of detail. How the outcome is achieved is an implementation detail.
- API changes as reference: when trimming verbose entries, preserve API changes (new parameters, new defaults) since they're useful for integration.
- Follow existing verbosity: 0.7.0 uses brief 1-sentence bullets as the target density.

## What's worth naming

- Workflow-level behavior changes that change how agents or users operate, even if the implementation is small.
- New parameters, new defaults, removed features.
- Anything a user would need to know to adapt their usage.

## Common pitfalls

- Treating it like a commit log (implementation details, internal function names).
- Describing transitions from unreleased internal states instead of shipped end results.
- Repeating the same change at multiple levels of detail.
- Missing the user impact in favor of technical jargon.
