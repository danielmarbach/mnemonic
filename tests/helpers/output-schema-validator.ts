import { Ajv2020 } from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv";

type ListedTool = { name: string; outputSchema?: Record<string, unknown> };

export type OutputSchemaValidators = Map<string, ValidateFunction>;

export function compileOutputSchemaValidators(tools: ListedTool[]): OutputSchemaValidators {
  const ajv = new Ajv2020({ allErrors: true, strict: false, validateSchema: true });
  const validators: OutputSchemaValidators = new Map();
  for (const tool of tools) {
    if (tool.outputSchema && typeof tool.outputSchema === "object") {
      validators.set(tool.name, ajv.compile(tool.outputSchema));
    }
  }
  return validators;
}

/**
 * Mirrors the MCP SDK client check in callTool: a successful result from a tool that
 * declares an outputSchema must carry structuredContent that validates against it.
 */
export function assertStructuredContentMatchesOutputSchema(
  validators: OutputSchemaValidators,
  toolName: string,
  result: Record<string, unknown> | undefined,
): void {
  const validate = validators.get(toolName);
  if (!validate || !result || result["isError"] === true) {
    return;
  }

  const structuredContent = result["structuredContent"];
  if (structuredContent === undefined) {
    throw new Error(
      `Tool '${toolName}' returned no structuredContent but declares an outputSchema`,
    );
  }
  if (!validate(structuredContent)) {
    const details = (validate.errors ?? [])
      .map(
        (error) => `${error.instancePath || "/"}: ${error.message ?? "schema validation failed"}`,
      )
      .join("; ");
    throw new Error(
      `Tool '${toolName}' structuredContent does not match its registered outputSchema: ${details}`,
    );
  }
}
