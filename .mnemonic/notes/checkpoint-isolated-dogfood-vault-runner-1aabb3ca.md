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
updatedAt: '2026-04-05T17:41:52.947Z'
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Checkpoint for isolating dogfood pack runs from the live project vault.

Current status: the dogfood harness itself is corrected and verified, but the latest real runs were still noisy because they executed against the live mnemonic vault. That caused recent-note measurements to be polluted by dogfood artifacts and exposed local git/signing failures that distorted the run results.

What was attempted:

- Fixed the dogfood harness schema handling.
- Added targeted tests for the runner helpers.
- Added support for running the packs against a chosen server entrypoint.
- Reran the packs against the local build and observed that local vault state still contaminated recent-navigation measurements.

What worked:

- The runner can now target the locally built server.
- The harness now measures the intended MCP fields correctly.
- The remaining noise is environmental or state-related rather than a parsing problem.

Blockers and constraints:

- Running against the live vault makes recent-note and relationship-navigation checks non-reproducible.
- Local vault git/signing issues can produce local-only persistence states that are irrelevant to the product behavior being dogfooded.
- The solution should improve measurement quality without changing product semantics.

Alternatives considered:

- Keep using the live vault and manually interpret noise: possible but low confidence.
- Hardcode cleanup logic for this repo's dogfood notes: rejected because it is repo-specific and brittle.
- Run the packs against an isolated temporary vault clone or copy: preferred because it keeps the measurement clean and reproducible.

Next action: design the dogfood runner to create an isolated temporary vault clone or copy, execute the packs there, and discard it afterward so recent-navigation and persistence checks reflect product behavior instead of local vault state.

Confidence: high.
