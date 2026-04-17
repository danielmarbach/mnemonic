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
updatedAt: '2026-04-17T04:52:02.109Z'
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Checkpoint for the rationale-style retrieval redesign follow-up.

Current status: the broad design direction is now approved. The next step is to turn the approved design into a written implementation plan, then implement it test-first.

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

Testing shape agreed for the next implementation plan:

- unit tests for the promotion scorer
- recall integration tests for canonical-answer promotion
- guardrail tests so factual/entity queries and temporary notes do not regress

Written spec path:

- `docs/superpowers/specs/2026-04-17-rationale-style-retrieval-design.md`

Constraints still in force:

- remain language-independent in primary signals
- no repo-specific title exceptions or allowlists
- no new persistent retrieval layer
- do not modify TF-IDF rescue as part of this work

Next action: have the user review the written spec, then write the implementation plan for the bounded canonical-explanation promotion design.
