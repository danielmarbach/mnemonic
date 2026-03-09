---
title: CI-safe MCP integration and failure learning workflow
tags:
  - ci
  - testing
  - mcp
  - workflow
  - portability
  - timeout
  - ollama
  - decision
lifecycle: permanent
createdAt: '2026-03-08T09:08:28.685Z'
updatedAt: '2026-03-08T09:08:28.685Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 0
---
Consolidated operational guidance for CI-safe MCP integration tests and artifact-first CI failure learning in mnemonic.

## Consolidated from:
### CI failure learning capture workflow
*Source: `ci-failure-learning-capture-workflow-195bd6ed`*

Implemented the first version of CI failure learning capture.

- CI now captures failing test output, summarizes it deterministically, and uploads a `ci-learning` artifact containing `ci-failure-raw.json`, `ci-learning.md`, and the raw test log.
- Promotion into mnemonic is manual through a dedicated `workflow_dispatch` workflow rather than automatic on every failed run.
- The promotion path uses the real local MCP entrypoint and creates a new memory note for each promoted incident instead of appending to a fixed note.
- The implementation intentionally avoids requiring a real Ollama daemon in CI: failure capture is deterministic, and MCP promotion uses a fake local embeddings endpoint.
- We also documented the workflow in `AGENT.md` and recorded the execution plan in `PLAN.md`.

### CI portability lesson for MCP integration tests
*Source: `ci-portability-lesson-for-mcp-integration-tests-7a701d52`*

Captured a CI lesson from the MCP integration test work.

- Avoid machine-specific absolute paths in tests; resolve repo-relative paths from `import.meta.url` or equivalent.
- Keep MCP integration tests hermetic for CI: temp `VAULT_PATH`, `DISABLE_GIT=true`, and a fake local embeddings endpoint via `OLLAMA_URL`.
- If a test launches the real local script, assume the working directory will differ across developer machines and CI runners.
- Dogfooding locally is necessary but not sufficient; any script-spawning test should also be reviewed for environment portability before merging.

### MCP integration test CI constraints
*Source: `mcp-integration-test-ci-constraints-fad852eb`*

Documented MCP integration-test constraints in AGENT.md.

- `tests/mcp.integration.test.ts` should remain CI-safe by running `scripts/mcp-local.sh` with `DISABLE_GIT=true`.
- The test should use a fake local embeddings endpoint via `OLLAMA_URL` instead of requiring a real Ollama daemon in CI.
- MCP integration tests should use a temp `VAULT_PATH` so they do not mutate the real vault or repository state.

### CI timeout lesson for MCP integration smoke test
*Source: `ci-timeout-lesson-for-mcp-integration-smoke-test-a6ac4c0a`*

Refined the first CI failure-learning rollout after reviewing a real failing artifact.

- The MCP integration smoke test was valid but too close to Vitest's default 5s timeout on GitHub Actions, so it now uses an explicit 15s timeout.
- The CI failure summarizer now gives a timeout-specific lesson instead of a generic portability/isolation hint.
- This keeps the artifact more actionable: timeout failures should suggest increasing explicit timeouts or reducing process startup overhead on shared runners.
- The broader artifact-first/manual-promotion design still looks sound; the first real artifact mainly exposed a test-runtime threshold issue.
