import Anthropic from "@anthropic-ai/sdk";
import type { EvalProvider, Message, ToolCall, ToolDefinition, Turn } from "../provider.js";

export class AnthropicProvider implements EvalProvider {
  readonly name = "anthropic";
  private client: Anthropic;
  private model: string;

  constructor(model = "claude-sonnet-4-6") {
    this.client = new Anthropic();
    this.model = model;
  }

  async chat(params: {
    systemPrompt: string;
    messages: Message[];
    tools: ToolDefinition[];
  }): Promise<Turn> {
    const anthropicMessages = toAnthropicMessages(params.messages);
    const tools: Anthropic.Tool[] = params.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Anthropic.Tool["input_schema"],
    }));

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: params.systemPrompt,
      messages: anthropicMessages,
      tools,
    });

    const toolCalls: ToolCall[] = [];
    let text: string | undefined;

    for (const block of response.content) {
      if (block.type === "text") {
        text = block.text;
      } else if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        });
      }
    }

    return { content: text, toolCalls };
  }
}

function toAnthropicMessages(
  messages: Message[],
): Anthropic.MessageParam[] {
  const result: Anthropic.MessageParam[] = [];

  for (const msg of messages) {
    if (msg.role === "user") {
      result.push({ role: "user", content: msg.content });
    } else if (msg.role === "assistant") {
      const content: (Anthropic.TextBlockParam | Anthropic.ToolUseBlockParam)[] = [];
      if (msg.content) {
        content.push({ type: "text", text: msg.content });
      }
      for (const tc of msg.toolCalls) {
        content.push({
          type: "tool_use",
          id: tc.id,
          name: tc.name,
          input: tc.input,
        });
      }
      result.push({ role: "assistant", content });
    } else if (msg.role === "tool") {
      // Tool results go back as user messages with tool_result blocks.
      // Consecutive tool results can be batched into one user message.
      const last = result[result.length - 1];
      const block: Anthropic.ToolResultBlockParam = {
        type: "tool_result",
        tool_use_id: msg.toolCallId,
        content: msg.content,
      };
      if (last?.role === "user" && Array.isArray(last.content)) {
        (last.content as Anthropic.ToolResultBlockParam[]).push(block);
      } else {
        result.push({ role: "user", content: [block] });
      }
    }
  }

  return result;
}
