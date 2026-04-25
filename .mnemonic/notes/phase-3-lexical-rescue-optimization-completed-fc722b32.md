---
title: Phase 3 lexical rescue optimization (completed)
tags:
  - hindsight
  - recall
  - phase-3
  - completed
lifecycle: permanent
createdAt: '2026-04-25T21:43:29.712Z'
updatedAt: '2026-04-25T21:43:29.712Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: plan-mnemonic-recall-improvements-from-hindsight-research-5b059160
    type: follows
  - id: rpir-workflow-design-for-mnemonic-research-plan-implement-re-80b00851
    type: example-of
memoryVersion: 1
---
Phase 3 implemented pre-tokenized TF-IDF corpus reuse for lexical rescue ranking.

- Session-cached projection token reuse keyed by `vaultPath::noteId`.
- Avoids repeated tokenization during lexical rescue in-session.
- Scopes delta vs original plan: session-scoped cache instead of persistent per-vault term-frequency index.
- This keeps architecture aligned with file-first/no-new-artifact constraints.

Decision: `decision-phase-3-lexical-rescue-uses-session-cached-projecti-6b5197fc`
Implementation: `collectLexicalRescueCandidates` in `src/index.ts`; token/corpus helpers in `src/cache.ts` and `src/lexical.ts`.
