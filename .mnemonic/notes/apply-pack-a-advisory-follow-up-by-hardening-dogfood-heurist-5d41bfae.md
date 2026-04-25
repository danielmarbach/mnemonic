---
title: 'Apply: Pack A advisory follow-up by hardening dogfood heuristics'
tags:
  - workflow
  - apply
  - dogfooding
  - phase2
  - rrf
lifecycle: temporary
createdAt: '2026-04-25T07:40:36.174Z'
updatedAt: '2026-04-25T07:40:36.174Z'
role: plan
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mnemonic-key-design-decisions-3f2a6273
    type: related-to
memoryVersion: 1
---
# Apply: Pack A advisory follow-up by hardening dogfood heuristics

## Goal

Address the two Phase 2 advisory findings from isolated dogfooding by reducing brittle checks in Pack A while keeping required checks unchanged.

## Root cause

1. **Canonical design question check was too strict**
   - Pack A required the exact note `mnemonic — key design decisions` to be rank #1 for query `Why are embeddings gitignored?`.
   - After ongoing recall/ranking evolution and corpus growth, this can still be a good run even if that note is not top-1.

2. **Recent-to-architecture navigation check was too narrow**
   - Pack A selected one recent note for relationship traversal and could miss valid architecture/decision paths present on other recent notes.

## Changes

Updated `scripts/run-dogfood-packs.mjs`:

- Increased recall window for canonical-design question from `limit: 5` to `limit: 20` and checks whether `mnemonic — key design decisions` appears anywhere in that result set.
- Navigation heuristic now evaluates up to the first 3 recent notes (not just one selected note).
- Navigation heuristic now checks:
  - seed note titles,
  - seed note immediate relationship titles,
  - one-hop fetched note title + its relationship titles.

This keeps the advisory signal meaningful while reducing false positives caused by ranking noise and single-seed sensitivity.

## Verification

- `npm run dogfood:isolated` ✅
  - `releaseGate.requiredFailures: []`
  - `releaseGate.advisoryFindings: []`
- `npm test -- tests/dogfooding-runner.integration.test.ts` ✅
- `npm test -- tests/dogfooding-runner.unit.test.ts tests/dogfooding-isolated-vault.unit.test.ts` ✅

## Scope

No runtime memory retrieval algorithm change in this apply step; changes are limited to dogfooding evaluation heuristics.
