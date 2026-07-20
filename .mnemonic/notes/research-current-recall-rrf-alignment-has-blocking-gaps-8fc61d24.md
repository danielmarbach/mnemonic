---
title: 'Research: current recall RRF alignment has blocking gaps'
tags:
  - research
  - rrf
  - ranking
  - recall
  - hybrid-search
  - retrieval
  - review
lifecycle: temporary
createdAt: '2026-07-20T16:02:11.020Z'
updatedAt: '2026-07-20T16:02:11.020Z'
role: research
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
The current implementation is a hybrid semantic-first ranker, not a fully independent three-channel RRF pipeline. Semantic candidates are generated from embeddings in src/tools/recall.ts, lexical scoring is applied only to those candidates in applyLexicalReranking, and TF-IDF lexical rescue scans non-semantic notes only when the strongest semantic score is below 0.35 or no semantic candidates exist. Therefore a strong semantic result can prevent an exact identifier or phrase match outside the semantic set from entering fusion. Graph spreading is also seeded from only the top five semantic candidates with score >= 0.5; it is a bounded semantic-conditioned expansion rather than a corpus-independent graph retriever, which may be intentional but should be explicit.

RRF itself is mathematically correct in computeHybridScore: K=60, missing ranks contribute zero, and graph is a third term. However raw semantic magnitude remains the primary additive term: boosted = raw cosine + project/metadata/temporal boosts, then hybrid = boosted + 3.0 *RRF + canonical*0.05. Three rank-1 channels contribute only about 0.1475 after scaling, so unbounded semantic score differences still dominate. The all-ranks-missing fallback returns boosted directly, so candidates outside the rank window can still affect ordering through raw semantic score.

Determinism is incomplete. Semantic, lexical, graph, rescue, and final comparison sorts lack a stable note-id tie-breaker. assignDenseRanks is competition ranking (1,1,3), despite its dense name, and rank-window truncation is based on array position rather than the assigned rank. Existing tests cover RRF presence, graph discovery, rescue, and rank-window assignment, but not strong-semantic lexical-only admission, raw-score calibration invariance, out-of-window score suppression, stable ties, or independent channel rank lists.

Product policy is stronger than the documented tiebreaker behavior: selectRecallResults and selectWorkflowResults hard-select current-project candidates before global candidates for scope=all when they fill the limit. This can overturn a strong global retrieval consensus and should either be bounded or explicitly documented as a selection policy. Canonical promotion is bounded but currently participates in pre-selection ranking rather than being strictly context shaping.

The supplied RRF article supports rank-only fusion, independent result lists, zero contribution for missing channels, deterministic upstream tie handling, and bounded rank windows. It does not by itself justify a particular semantic prior, lexical window, graph dependency, or project policy. Recommendation: do not declare the implementation good as-is. A single coherent follow-up should make lexical retrieval independently bounded, isolate RRF from raw semantic magnitude with an explicitly bounded semantic-confidence prior, add stable tie-breakers and score decomposition diagnostics, and either bound or relabel project-first selection. Keep graph's semantic seeding and high-confidence temporal filtering as explicit product policies unless evaluation shows they are harmful.

Fresh verification: targeted recall/lexical suites passed (4 files, 108 tests); full suite passed (65 files, 1,135 tests); npm run build/typecheck passed; npm run lint failed on five existing Prettier errors in src/git.ts, src/storage.ts, src/structured-content.ts, tests/helpers/mcp.ts, and tests/mcp-schema-contract.integration.test.ts. No source changes were made during this review.
