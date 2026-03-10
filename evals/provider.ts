export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export type Message =
  | { role: "user"; content: string }
  | { role: "assistant"; content?: string; toolCalls: ToolCall[] }
  | { role: "tool"; toolCallId: string; toolName: string; content: string };

export interface Turn {
  content?: string;
  toolCalls: ToolCall[];
}

export interface EvalProvider {
  readonly name: string;
  chat(params: {
    systemPrompt: string;
    messages: Message[];
    tools: ToolDefinition[];
  }): Promise<Turn>;
}
