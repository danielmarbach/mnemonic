---
title: 'Apply: Phase 1 advisory memory guidance from Microsoft memory research'
tags:
  - workflow
  - apply
  - memory-architecture
  - documentation
  - guidance
lifecycle: temporary
createdAt: '2026-05-12T20:38:30.151Z'
updatedAt: '2026-05-12T20:38:30.151Z'
role: context
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
# Apply: Phase 1 Advisory Memory Guidance

Implements Phase 1 of `plan-advisory-memory-health-diagnostics-from-microsoft-memor-a0aa3e62`.

## What Changed

- Updated `AGENT.md` with explicit attention-filter guidance for note creation.
- Updated `AGENT.md` memory hygiene to say consolidation should deduplicate overlap while preserving unique evidence, and that forgetting is explicit.
- Updated `src/prompts.ts` for `mnemonic-workflow-hint` and `mnemonic-rpi-workflow` with the same agent-facing rules.
- Updated bundled skill `skills/mnemonic-rpi-workflow/SKILL.md` to stay aligned with the MCP prompt.
- Updated `README.md` and `docs/index.html` with user-facing, outcome-first copy following homepage principles: explain what future work needs, avoid routine chatter, keep useful outcomes, preserve details that still matter, and make cleanup explicit.
- Updated `tests/tool-descriptions.integration.test.ts` to assert the new prompt guidance is present.

## Constraints Checked

- No automatic forgetting added.
- No read-path writes added.
- No structured-output fields changed.
- MCP tool descriptions were not expanded.
- Homepage/README copy uses purpose-over-mechanism language; technical terms are kept in agent-facing surfaces.
- RPIR prompt and bundled RPIR skill stay aligned.

## Review

Fresh TypeScript-focused review initially found wording conflicts around "expire" and missing RPIR prompt alignment. Fixed by replacing ambiguous expiration language with explicit cleanup language and adding RPIR prompt tests.

Second review outcome: continue. No findings.

## Validation

- `npm run build` — pass
- `npm test -- tests/tool-descriptions.integration.test.ts tests/pipeline-smoke.integration.test.ts` — pass, 12 tests

## Noted Worktree State

An unrelated untracked file named `false` exists in the worktree. It was not touched and should not be staged with this change.
