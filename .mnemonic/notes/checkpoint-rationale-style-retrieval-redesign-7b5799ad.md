---
title: 'Checkpoint: rationale-style retrieval redesign'
tags:
  - checkpoint
  - temporary-notes
  - retrieval
  - recall
  - rationale
lifecycle: temporary
createdAt: '2026-04-05T17:41:52.918Z'
updatedAt: '2026-04-05T17:41:52.918Z'
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Checkpoint for a larger generic retrieval change aimed at rationale-style queries.

Current status: small generic hybrid reranking improvements were implemented and verified, but they did not materially improve the real-corpus result for rationale-style queries such as asking why a design decision exists. The likely next step is a broader retrieval design rather than another local scoring tweak.

What was attempted:

- Added rare-token coverage to hybrid recall reranking.
- Added contiguous significant-token phrase coverage to hybrid recall reranking.
- Verified these changes with targeted unit tests.
- Rechecked the real mnemonic corpus and confirmed the canonical rationale note still ranked too low for the motivating query.

What worked:

- The changes were generic and language-independent.
- They improved the retrieval machinery in a principled way without repo-specific heuristics.
- They established that the remaining gap is not likely solvable with one more small additive boost.

Blockers and constraints:

- Further small tweaks risk overfitting to this repo's note corpus.
- Any next design must remain language-independent and avoid repo-specific boosts, note-id exceptions, or English-only rationale keywords.
- A stronger solution likely needs a more explicit retrieval path for explanatory or canonical notes.

Alternatives considered:

- Keep adding more reranking boosts: rejected because it trends toward corpus-specific tuning.
- Stop entirely: rejected because the gap is still real for end users.
- Design a larger two-stage retrieval or rationale-aware selection model: most promising direction.

Next action: design a larger still-generic retrieval approach for rationale-style queries, likely as a two-stage retrieval/scoring change with tests based on abstract rationale-note behavior rather than mnemonic-specific note titles.

Confidence: medium.
