import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions.js";
import type { EvalProvider, Message, ToolCall, ToolDefinition, Turn } from "../provider.js";

export class OpenAIProvider implements EvalProvider {
  readonly name: string;
  private client: OpenAI;
  private model: string;

  constructor(model = "gpt-4o", baseURL?: string, apiKey?: string) {
    this.client = new OpenAI({ baseURL, apiKey });
    this.model = model;
    this.name = baseURL ? `openai-compat(${model})` : `openai(${model})`;
  }

  async chat(params: {
    systemPrompt: string;
    messages: Message[];
    tools: ToolDefinition[];
  }): Promise<Turn> {
    const openaiMessages: ChatCompletionMessageParam[] = [
      { role: "system", content: params.systemPrompt },
      ...toOpenAIMessages(params.messages),
    ];

    const tools: ChatCompletionTool[] = params.tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema as Record<string, unknown>,
      },
    }));

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: openaiMessages,
      tools,
      tool_choice: "auto",
    });

    const choice = response.choices[0];
    if (!choice) throw new Error("No choices in OpenAI response");

    const toolCalls: ToolCall[] = (choice.message.tool_calls ?? [])
      .filter((tc): tc is typeof tc & { type: "function"; function: { name: string; arguments: string } } =>
        tc.type === "function",
      )
      .map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        input: JSON.parse(tc.function.arguments) as Record<string, unknown>,
      }));

    return {
      content: choice.message.content ?? undefined,
      toolCalls,
    };
  }
}

function toOpenAIMessages(messages: Message[]): ChatCompletionMessageParam[] {
  return messages.flatMap((msg): ChatCompletionMessageParam[] => {
    if (msg.role === "user") {
      return [{ role: "user", content: msg.content }];
    } else if (msg.role === "assistant") {
      const toolCalls =
        msg.toolCalls.length > 0
          ? msg.toolCalls.map((tc) => ({
              id: tc.id,
              type: "function" as const,
              function: { name: tc.name, arguments: JSON.stringify(tc.input) },
            }))
          : undefined;
      return [{ role: "assistant", content: msg.content ?? null, tool_calls: toolCalls }];
    } else if (msg.role === "tool") {
      return [
        {
          role: "tool",
          tool_call_id: msg.toolCallId,
          content: msg.content,
        },
      ];
    }
    return [];
  });
}
