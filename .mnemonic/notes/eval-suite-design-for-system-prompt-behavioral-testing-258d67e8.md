---
title: Eval suite design for system prompt behavioral testing
tags:
  - eval
  - testing
  - system-prompt
  - design
  - multi-provider
lifecycle: permanent
createdAt: '2026-03-10T21:56:09.869Z'
updatedAt: '2026-03-10T21:56:09.869Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
## Decision

Build a local eval suite to test whether models follow the mnemonic system prompt (SYSTEM_PROMPT.md) correctly. Run locally via `npm run eval`, separate from the CI-safe `npm test` suite.

## Why this approach

The system prompt instructs LLMs how to use mnemonic tools. An eval checks behavioral compliance: given a user message and mocked mnemonic tool responses, did the model make the right sequence of tool calls? This cannot be verified with unit tests — it requires real API calls.

## Architecture

Thin provider abstraction with two adapters:

```text
evals/
  harness.ts          # runs a scenario against any provider
  providers/
    anthropic.ts      # wraps @anthropic-ai/sdk
    openai.ts         # wraps openai SDK
  scenarios/
    session-start.ts
    recall-before-remember.ts
    lifecycle-selection.ts
```

Provider interface:

```typescript
interface EvalProvider {
  runTurn(
    messages: Message[],
    tools: ToolDefinition[],
    systemPrompt: string
  ): Promise<{ text?: string; toolCalls?: ToolCall[] }>;
}
```

Run with: `PROVIDER=anthropic npm run eval` or `PROVIDER=openai npm run eval`

## Key scenarios (highest signal)

Session start in a project: detect_project then project_memory_summary or recall.
User mentions something unfamiliar: recall before asking for explanation.
Storing a new fact: recall first, then remember or update.
Storing a decision: lifecycle permanent, imperative summary.
Storing a WIP plan: lifecycle temporary.
After remember: considers relate call.
3+ notes on same topic: suggests or calls consolidate.
remember without cwd: goes to main vault as global note.

## Multi-provider rationale

Running the same scenarios against Claude and GPT-4 lets you regression-test prompt changes across providers and see which model follows multi-step ordering rules more faithfully. This is a good reason to keep the harness provider-agnostic from the start.

## Constraints

- Needs ANTHROPIC_API_KEY or OPENAI_API_KEY, not zero-cost
- Non-deterministic: assert behavioral patterns not exact strings
- Keep separate from npm test so CI does not require API keys
- Mocked tool responses keep cost low and scenarios deterministic
