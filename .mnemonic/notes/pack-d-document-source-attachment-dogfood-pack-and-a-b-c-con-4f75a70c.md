---
title: >-
  Pack D: document-source attachment dogfood pack and A/B/C consolidation
  hardening
tags:
  - dogfooding
  - testing
  - prompt
  - reusable
  - attachments
  - markdown
lifecycle: permanent
createdAt: '2026-07-29T21:44:18.324Z'
updatedAt: '2026-07-29T21:44:30.910Z'
role: reference
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: document-source-attachment-five-bugs-found-and-fixed-via-pac-24bedd4b
    type: related-to
memoryVersion: 1
---
# Pack D: document-source attachment dogfood pack and A/B/C consolidation hardening

## Pack D — document-source attachment (new)

Reusable pack at `scripts/dogfood-document-source.mjs`. Drives the LOCAL build over stdio against an isolated temp environment (reuses `createIsolatedDogfoodVault` for the consumer; adds a temp main vault so attachment-config writes stay isolated, and a temp document-source repo with an `origin` + `origin/HEAD`). Uses distinctive nonsense tokens (`zeta-workflow-engine`, `florgnart-bottleneck`) so it is immune to vault vocabulary and consolidation. Generations are in-memory, so add -> sync -> recall -> get must run in one spawned session.

Checks (12): add_attachment config (D1), list_attachments (D2), sync indexes docs/chunks (D3), recall surfaces document-chunk candidates with the full contract (D4), get(chunk:) and get(doc:) exact retrieval (D5a/D5b), mutation rejection of doc:/chunk: with ImmutableDocumentSourceError (D6), scope guard global-excludes docs (D7), mode/filter guard excludes docs from temporal + tag filters (D8), per-document chunk cap of 5 (D9), directory-prefixed include glob scopes by path (D11), remove_attachment teardown (D10). Run with `node scripts/dogfood-document-source.mjs` (or `MNEMONIC_ENTRYPOINT=build/index.js ...`).

This pack also fills the review gap "no integration tests for full sync -> generation -> get -> recall flow"; the deterministic regression for the same flow lives in `tests/document-source.integration.test.ts`.

## Packs A/B/C — consolidation-robustness hardening

Dogfooding A/B/C against the consolidated vault produced two advisory findings that were consolidation drift, not code regressions, plus one capture-path fragility. Hardened in `scripts/run-dogfood-packs.mjs`:

- Canonical-design check now matches by stable note id (derived from the summary orientation anchor, fallback `mnemonic-key-decisions-3f2a6273`), not exact title, so a rename/merge no longer causes a false advisory.
- Navigation-to-architecture check now seeds from the orientation anchor (stable id) in addition to the three most-recent notes; this fixed the `recent-to-architecture navigation works` false advisory.
- `upsertNote` now matches prior result notes by a stable prefix (trailing date/isolated parentheticals stripped) so live-mode re-runs UPDATE instead of duplicating. In `--isolated` mode each run copies a fresh vault, so it still `remember`s by design.

## Known caveat: isolated runner re-embeds from scratch

`createIsolatedDogfoodVault` filters out `embeddings/` and `projections/` on copy, so recall-ranking advisories (e.g. "recall answers canonical design questions") are noisy in isolated mode: the canonical note ranked #1 for the embeddings query in the LIVE vault but not in the isolated re-embed. Treat recall-ranking advisories from `--isolated` as embedding-state-dependent, not authoritative; the canonical check passes in the live vault.

## Environmental note

The host had `commit.gpgsign=true` globally with a failing 1Password signing agent, which blocked all git-commiting tests and memory writes. Tests now set `commit.gpgsign=false` locally (hermetic); memory writes were unblocked with a local repo override (`git config --local commit.gpgsign false`, reversible).
