---
title: 'Checkpoint: isolated dogfood vault runner'
tags:
  - checkpoint
  - temporary-notes
  - dogfooding
  - testing
  - runner
lifecycle: temporary
createdAt: '2026-04-05T17:41:52.947Z'
updatedAt: '2026-04-16T20:41:04.152Z'
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Checkpoint for isolating dogfood pack runs from the live project vault.

Current status: the need for an isolated runner is now reinforced by the 2026-04-16 real-note dogfooding runs.

What was attempted:

- Fixed the dogfood harness schema handling.
- Added targeted tests for the runner helpers.
- Added support for running the packs against a chosen server entrypoint.
- Reran the packs against the local build and observed that local vault state still contaminated recent-navigation measurements.
- Ran Pack A, Pack B, and a closest-honest approximation of Pack C against the live project vault on 2026-04-16.

What worked:

- The runner can target the locally built server.
- The harness measures the intended MCP fields correctly.
- The latest dogfooding runs did not reveal a TF-IDF-specific regression in recall/orientation behavior.
- The remaining noise still points to environment and vault-state contamination rather than harness parsing.

Blockers and constraints:

- Running against the live vault makes recent-note and relationship-navigation checks non-reproducible.
- Local vault git/signing issues can produce local-only persistence states that are irrelevant to the product behavior being dogfooded.
- Temporary dogfood notes and active experiment notes pollute recency-driven checks, especially Pack A's recent-to-architecture navigation.
- The solution should improve measurement quality without changing product semantics.

Alternatives considered:

- Keep using the live vault and manually interpret noise: possible but still low confidence.
- Hardcode cleanup logic for this repo's dogfood notes: rejected because it is repo-specific and brittle.
- Run the packs against an isolated temporary vault clone or copy: still preferred because it keeps the measurement clean and reproducible.

Current next action:

- implement a small isolated dogfood runner that clones or copies the current project vault into a temporary workspace, runs the packs there against the chosen MCP entrypoint, and discards the workspace afterward so recency and relationship-navigation checks reflect product behavior rather than local live-vault state.

Confidence: high.
