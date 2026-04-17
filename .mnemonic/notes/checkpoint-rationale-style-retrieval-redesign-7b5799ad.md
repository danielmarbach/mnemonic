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
updatedAt: '2026-04-17T04:55:50.889Z'
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Checkpoint for the rationale-style retrieval redesign follow-up.

Current status: the design is approved and the implementation plan is now written. The next step is to choose execution mode and implement it test-first.

Approved design:

- keep the normal semantic-first retrieval path as the entry path
- do not add a special rationale-query classifier as the main mechanism
- add a bounded canonical-explanation promotion step after semantic retrieval and project-biased widening build the normal candidate neighborhood
- compute a `canonicalExplanationScore` only over that bounded neighborhood
- only let the promotion step materially affect candidates that are already semantically plausible
- use language-independent primary signals: semantic alignment, relationship centrality, connection diversity, durable-note bias, explicit role metadata when present, and light structural support
- allow wording cues only as weak tiebreakers, not as the backbone of success
- cap the effect so central but off-topic notes, generic overviews, and temporary checkpoint notes cannot displace better direct answers
- keep the change fail-soft and local to ranking logic

Why this design was chosen:

- small generic reranking tweaks were already tried and did not materially fix the real-corpus canonical-answer gap
- a rationale-query classifier would likely overfit to English wording and violate the language-independent design intent
- metadata-only or repo-specific canonical-note solutions would create authoring burden and corpus-shaped behavior
- the real gap appears to be bounded promotion of canonical explanatory notes that are already near the correct semantic neighborhood

Testing shape agreed for implementation:

- unit tests for the promotion scorer
- unit guardrails for weak-wording/language-independent promotion
- recall integration tests for canonical-answer promotion
- guardrail tests so factual/entity queries and temporary notes do not regress

Written spec path:

- `docs/superpowers/specs/2026-04-17-rationale-style-retrieval-design.md`

Written plan path:

- `docs/superpowers/plans/2026-04-17-rationale-style-retrieval-implementation.md`

Constraints still in force:

- remain language-independent in primary signals
- no repo-specific title exceptions or allowlists
- no new persistent retrieval layer
- do not modify TF-IDF rescue as part of this work
- do not commit `docs/superpowers/*` artifacts unless the user later asks for that explicitly

Next action: execute the implementation plan using subagent-driven development or inline execution.
