import type { EvalProvider, Message, ToolCall, ToolDefinition } from "./provider.js";

const MAX_TURNS = 8;

export interface Scenario {
  name: string;
  description: string;
  /** Starting conversation messages (usually a single user message). */
  setup: Message[];
  /** Return a mock MCP server response for a tool call. */
  mockToolResponse(name: string, input: Record<string, unknown>): string;
  /** Return failure messages; empty array means the scenario passed. */
  assert(toolCalls: ToolCall[]): string[];
}

export interface ScenarioResult {
  scenario: string;
  passed: boolean;
  toolCallSequence: string[];
  failures: string[];
}

export async function runScenario(
  provider: EvalProvider,
  scenario: Scenario,
  systemPrompt: string,
  tools: ToolDefinition[],
): Promise<ScenarioResult> {
  const messages: Message[] = [...scenario.setup];
  const allToolCalls: ToolCall[] = [];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await provider.chat({ systemPrompt, messages, tools });

    if (response.toolCalls.length === 0) break;

    allToolCalls.push(...response.toolCalls);

    messages.push({
      role: "assistant",
      content: response.content,
      toolCalls: response.toolCalls,
    });

    for (const call of response.toolCalls) {
      messages.push({
        role: "tool",
        toolCallId: call.id,
        toolName: call.name,
        content: scenario.mockToolResponse(call.name, call.input),
      });
    }
  }

  const failures = scenario.assert(allToolCalls);
  return {
    scenario: scenario.name,
    passed: failures.length === 0,
    toolCallSequence: allToolCalls.map((c) => c.name),
    failures,
  };
}

// ── Assertion helpers ────────────────────────────────────────────────────────

/** Assert that a tool was called at all. */
export function assertCalled(toolCalls: ToolCall[], name: string): string[] {
  return toolCalls.some((c) => c.name === name)
    ? []
    : [`Expected '${name}' to be called but it was not`];
}

/** Assert that `before` appears before `after` in the call sequence. */
export function assertCalledBefore(
  toolCalls: ToolCall[],
  before: string,
  after: string,
): string[] {
  const beforeIdx = toolCalls.findIndex((c) => c.name === before);
  const afterIdx = toolCalls.findIndex((c) => c.name === after);
  if (beforeIdx === -1) return [`Expected '${before}' to be called`];
  if (afterIdx === -1) return [`Expected '${after}' to be called`];
  return beforeIdx < afterIdx
    ? []
    : [`Expected '${before}' (index ${beforeIdx}) to be called before '${after}' (index ${afterIdx})`];
}

/** Assert that the first call matching `name` has input satisfying `predicate`. */
export function assertInput(
  toolCalls: ToolCall[],
  name: string,
  predicate: (input: Record<string, unknown>) => boolean,
  description: string,
): string[] {
  const call = toolCalls.find((c) => c.name === name);
  if (!call) return [`Expected '${name}' to be called`];
  return predicate(call.input)
    ? []
    : [`'${name}' input failed: ${description} (got ${JSON.stringify(call.input)})`];
}

/** Assert that `name` was NOT called. */
export function assertNotCalled(toolCalls: ToolCall[], name: string): string[] {
  return toolCalls.some((c) => c.name === name)
    ? [`Expected '${name}' NOT to be called but it was`]
    : [];
}
