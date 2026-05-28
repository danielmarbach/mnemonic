import Ajv, { type ValidateFunction } from "ajv";

import { createPersistentMcpSession } from "./mcp.js";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

export type MpcListedTool = {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: JsonObject;
  outputSchema?: JsonObject;
  annotations?: JsonObject;
};

type SchemaDrivenClientOptions = {
  ollamaUrl?: string;
  disableGit?: boolean;
  env?: Record<string, string>;
};

export type SchemaDrivenMcpClient = {
  tools: MpcListedTool[];
  callTool: (
    toolName: string,
    arguments_: Record<string, unknown>,
  ) => Promise<{ text: string; structuredContent?: Record<string, unknown> }>;
  close: () => Promise<void>;
};

function formatSchemaError(
  schemaKind: "inputSchema" | "outputSchema",
  toolName: string,
  validate: ValidateFunction,
): string {
  const errors = validate.errors ?? [];
  const details = errors
    .map((error) => {
      const path = error.instancePath || "/";
      return `${path}: ${error.message ?? "schema validation failed"}`;
    })
    .join("; ");
  return `Tool '${toolName}' ${schemaKind} validation failed: ${details || "unknown validation error"}`;
}

export async function createSchemaDrivenMcpClient(
  vaultDir: string,
  options?: SchemaDrivenClientOptions,
): Promise<SchemaDrivenMcpClient> {
  const session = await createPersistentMcpSession(vaultDir, options);
  const toolsResponse = await session.callMethod("tools/list", {});
  const tools = toolsResponse["tools"] as MpcListedTool[] | undefined;
  if (!Array.isArray(tools)) {
    throw new Error("Missing tools/list response");
  }

  const ajv = new Ajv({ allErrors: true, strict: false, validateSchema: true });
  const inputValidators = new Map<string, ValidateFunction>();
  const outputValidators = new Map<string, ValidateFunction>();
  const toolByName = new Map<string, MpcListedTool>();

  for (const tool of tools) {
    toolByName.set(tool.name, tool);
    if (tool.inputSchema && typeof tool.inputSchema === "object") {
      inputValidators.set(tool.name, ajv.compile(tool.inputSchema));
    }
    if (tool.outputSchema && typeof tool.outputSchema === "object") {
      outputValidators.set(tool.name, ajv.compile(tool.outputSchema));
    }
  }

  return {
    tools,
    callTool: async (toolName, arguments_) => {
      const tool = toolByName.get(toolName);
      if (!tool) {
        throw new Error(`Tool '${toolName}' not found in tools/list`);
      }

      const inputValidator = inputValidators.get(toolName);
      if (inputValidator && !inputValidator(arguments_)) {
        throw new Error(formatSchemaError("inputSchema", toolName, inputValidator));
      }

      const result = await session.callMethod("tools/call", {
        name: toolName,
        arguments: arguments_,
      });

      const text = result?.content?.[0]?.text as string | undefined;
      if (!text) {
        throw new Error(`Missing tool response for ${toolName}`);
      }

      const structuredContent = result["structuredContent"] as Record<string, unknown> | undefined;
      const outputValidator = outputValidators.get(toolName);
      if (outputValidator) {
        if (structuredContent === undefined) {
          throw new Error(`Tool '${toolName}' returned no structuredContent but has outputSchema`);
        }
        if (!outputValidator(structuredContent)) {
          throw new Error(formatSchemaError("outputSchema", toolName, outputValidator));
        }
      }

      return { text, structuredContent };
    },
    close: session.close,
  };
}

function recursivelySortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => recursivelySortKeys(item));
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => [key, recursivelySortKeys(entryValue)]);
    return Object.fromEntries(entries);
  }

  return value;
}

export function normalizeMcpToolContract(tools: MpcListedTool[]): unknown {
  return tools
    .map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema,
      annotations: tool.annotations,
    }))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((tool) => recursivelySortKeys(tool));
}
