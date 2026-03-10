---
title: Eval suite scaffold in-progress state
tags:
  - eval
  - scaffold
  - wip
  - in-progress
lifecycle: temporary
createdAt: '2026-03-10T22:00:51.357Z'
updatedAt: '2026-03-10T22:03:01.772Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: eval-suite-design-for-system-prompt-behavioral-testing-258d67e8
    type: related-to
memoryVersion: 1
---
## Status: in-progress

Scaffolding eval suite for SYSTEM_PROMPT.md behavioral testing.

## Completed files

- evals/provider.ts — EvalProvider interface, ToolDefinition, ToolCall, Message, Turn types
- evals/tools.ts — mnemonic tool definitions (detect_project, project_memory_summary, recall, remember, update, relate, consolidate)
- evals/harness.ts — runScenario loop + assertion helpers (assertCalled, assertCalledBefore, assertInput, assertNotCalled)
- evals/providers/anthropic.ts — AnthropicProvider wrapping @anthropic-ai/sdk
- evals/providers/openai.ts — OpenAIProvider wrapping openai SDK
- evals/scenarios/session-start.ts — sessionStart scenario
- evals/scenarios/recall-before-remember.ts — recallBeforeRemember scenario
- evals/scenarios/lifecycle-selection.ts — lifecyclePermanent + lifecycleTemporary scenarios
- tsconfig.eval.json — separate TS config pointing at evals/, outDir build-evals/
- Installed @anthropic-ai/sdk and openai as devDependencies

## Still needed

- evals/run.ts — entry point: loads SYSTEM_PROMPT.md, selects provider via PROVIDER env, runs all scenarios, prints results
- package.json: add eval script (tsc -p tsconfig.eval.json && node build-evals/run.js)
- .gitignore: add build-evals/
- Verify tsc compiles cleanly

## Design summary

Provider abstraction: PROVIDER=anthropic|openai env var selects adapter.
Scenarios are self-contained objects with setup messages, mockToolResponse function, and assert function.
Harness runs multi-turn loop up to MAX_TURNS=8, collecting all tool calls.
Assertions check behavioral patterns (ordering, presence, input values) not exact strings.
No vitest dependency — custom lightweight reporter in run.ts.
Kept separate from npm test so CI never needs API keys.
