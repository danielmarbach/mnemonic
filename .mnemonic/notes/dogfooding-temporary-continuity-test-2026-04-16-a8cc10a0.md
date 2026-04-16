---
title: Dogfooding temporary continuity test 2026-04-16
tags:
  - dogfooding
  - testing
  - workflow
  - temporary-notes
lifecycle: temporary
createdAt: '2026-04-16T20:35:49.198Z'
updatedAt: '2026-04-16T20:35:49.198Z'
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Current status: validating TF-IDF rescue-only experiment dogfooding.

What was attempted:

- Implemented rescue-only TF-IDF shortlist ranking.
- Added synthetic and realistic corpus comparison harnesses.
- Optimized repeated corpus preparation work.
- Added title-aware boost to recover realistic broad-query quality.

What worked:

- Synthetic rare-term slice improved.
- Realistic note-shaped corpus is now quality-neutral.
- Guardrail tests remained green.

Blockers or open questions:

- Need to decide whether the realistic corpus is representative enough.
- Need to decide whether to keep rescue-only TF-IDF or gather one more comparison slice.

Next immediate action:

- Decide if the current realistic corpus is sufficient evidence for a Phase 1 keep/proceed decision.
