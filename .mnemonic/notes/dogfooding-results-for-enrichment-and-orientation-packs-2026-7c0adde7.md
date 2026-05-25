---
title: Dogfooding results for enrichment and orientation packs (2026-05-09)
tags:
  - dogfooding
  - testing
  - scorecard
  - regression
lifecycle: permanent
createdAt: '2026-05-25T17:38:47.619Z'
updatedAt: '2026-05-25T17:38:47.619Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: embedding-lazy-backfill-and-staleness-detection-implementati-c87cce90
    type: related-to
  - id: implementation-principles-for-mnemonic-mcp-2e178bba
    type: related-to
  - id: mnemonic-key-design-decisions-3f2a6273
    type: related-to
memoryVersion: 1
---
Consolidate the two sequential dogfooding result notes into one note covering both the enrichment and working-state test packs.

# Dogfooding results for enrichment and orientation packs (2026-05-09)

Observations from running mnemonic's dogfooding scorecards on two test packs using the installed mnemonic server.

## Core enrichment/orientation pack

Advisory findings:
- recall answers canonical design questions
- recent-to-architecture navigation works

Observations:
- Theme count: 17
- Top embeddings recall hit: Embedding lazy backfill and staleness detection
- Recent navigation reaches architecture/decision notes within three steps: false
- Working-state note count: 3
- Temporal filter returns results: true

## Working-state continuity pack

Advisory findings: none

Observations:
- Temporary recent titles: `Apply: Retrieval precision and diversity diagnostics`, `Review: Retrieval precision and diversity diagnostics`, `Plan: Retrieval precision and diversity diagnostics`, `Request: Research CAG-Bench paper — gaps and applications for mnemonic`, `Research: CAG-Bench paper analysis — gaps and applications for mnemonic`
- Temporary recall titles: `Research: index.ts dependency analysis for modular extraction`, `Plan: Split index.ts into modular structure`, `ReceiveProperties Design Research — Current State Analysis`
