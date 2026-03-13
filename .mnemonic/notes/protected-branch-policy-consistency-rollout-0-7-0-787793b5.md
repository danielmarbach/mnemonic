---
title: Protected-branch policy consistency rollout 0.7.0
tags:
  - release
  - protected-branches
  - rollout
  - 0.7.0
  - implementation
lifecycle: permanent
createdAt: '2026-03-13T09:44:43.390Z'
updatedAt: '2026-03-13T09:44:43.390Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Consolidated planning and execution notes for the 0.7.0 protected-branch rollout into a single durable implementation record.

## Consolidated from:
### Release 0.7.0 rollout plan for protected-branch policy consistency
*Source: `release-0-7-0-rollout-plan-for-protected-branch-policy-consi-e38381d0`*

Plan for the 0.7.0 release that extends protected-branch safeguards across mutating tools and updates docs + tests.

## Goals

- Enforce protected-branch policy consistently across mutating MCP tools that can auto-commit to project vaults.
- Align user-facing documentation and tool metadata with the new behavior.
- Ship as version `0.7.0` with clear changelog notes and strong test coverage.

## Implementation steps

1. **Recall and apply design guidelines**
   - Re-read the protected-branch design decision note and homepage design guidance memories.
   - Confirm final semantics for `ask`, `block`, `allow`, and one-time override behavior.

2. **Extend protected-branch enforcement in code**
   - Add a shared guard path used by mutating flows beyond `remember`.
   - Apply checks to:
     - `update`
     - `forget`
     - `move_memory`
     - `consolidate` mutating strategies (`execute-merge`, `prune-superseded` when commits touch project vault)
   - Ensure behavior is consistent when operations span both main and project vaults.

3. **Refresh MCP tool contracts**
   - Review and update tool descriptions so they state protected-branch behavior accurately.
   - Ensure annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) still match actual behavior after changes.
   - Add/update input fields (for example one-time override) only where necessary and document them clearly.

4. **Update docs and homepage content**
   - Update `docs/index.html` homepage copy so users understand protected-branch safeguards for mutating tools.
   - Update `README.md` with behavior, override, and policy guidance.
   - Update `AGENT.md` to keep implementation guidance and runtime semantics synchronized.

5. **Bump version and changelog**
   - Bump package version to `0.7.0`.
   - Add `0.7.0` release notes to changelog, including:
     - cross-tool protected-branch enforcement
     - updated MCP docs/descriptions
     - any new/changed override semantics
     - test coverage additions

6. **Add and verify test coverage**
   - Extend unit and integration tests to cover protected-branch behavior for each affected mutating tool.
   - Validate ask/block/allow behavior and one-time override semantics where supported.
   - Validate non-protected branches still behave normally.
   - Run targeted suites first, then full test run.

7. **Final QA pass**
   - Verify docs and tool schemas/descriptions are consistent with runtime behavior.
   - Confirm changelog + version bump are in sync.
   - Perform a final manual sanity flow on `main` to verify guarded behavior and expected guidance text.

## Suggested test focus

- Unit: policy resolution, branch matching, guard decision matrix.
- MCP integration: end-to-end behavior for `remember`, `update`, `forget`, `move_memory`, and `consolidate` mutating paths under ask/block/allow.
- Regression: ensure existing non-mutating tools and explicit safe paths remain unchanged.

### Release 0.7.0 protected-branch rollout execution results
*Source: `release-0-7-0-protected-branch-rollout-execution-results-5cbc2ca1`*

Implemented the 0.7.0 rollout plan for protected-branch policy consistency.

Completed work:

- Extended protected-branch enforcement beyond `remember` to `update`, `forget`, `move_memory`, and mutating `consolidate` paths.
- Added one-time override input support (`allowProtectedBranch`) for those tools.
- Updated branch-protection guidance text to reference the active tool name.
- Updated user and maintainer docs (`README.md`, `AGENT.md`, `docs/index.html`) to reflect cross-tool behavior.
- Added changelog entry for 0.7.0 and bumped package version to 0.7.0.
- Expanded MCP integration coverage to verify protected-branch policy behavior for the newly covered tools.
- Verified with build and targeted test suites.

Validation run:

- `npm run build`
- `npm run test -- tests/project-memory-policy.test.ts tests/config.test.ts tests/mcp.integration.test.ts`

Result: tests passed and build succeeded.
