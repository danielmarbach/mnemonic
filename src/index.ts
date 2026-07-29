#!/usr/bin/env node
import { McpServer, type RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { toJsonSchemaCompat } from "@modelcontextprotocol/sdk/server/zod-json-schema-compat.js";
import { normalizeObjectSchema } from "@modelcontextprotocol/sdk/server/zod-compat.js";

import { registerAllTools } from "./tools/index.js";
import { registerPrompts } from "./prompts.js";
import { createServerContext, readPackageVersion } from "./context.js";
import { startServer } from "./startup.js";
import { isCliCommand, showHelp, rejectUnknownCommand, runCliCommand } from "./cli/dispatch.js";

// ── CLI dispatch ────────────────────────────────────────────────────────────────

const cliArg = process.argv[2];

if (cliArg === "--help" || cliArg === "-h") {
  showHelp();
}

if (cliArg !== undefined && isCliCommand(cliArg)) {
  await runCliCommand(cliArg);
}

if (cliArg !== undefined && !cliArg.startsWith("-")) {
  rejectUnknownCommand(cliArg);
}

if (cliArg !== undefined && cliArg.startsWith("-")) {
  console.error(`Unknown option: ${cliArg}`);
  console.error("Run 'mnemonic --help' for usage.");
  process.exit(1);
}

// ── MCP Server ────────────────────────────────────────────────────────────────

const ctx = await createServerContext();

const server = new McpServer({
  name: "mnemonic",
  version: await readPackageVersion(),
});

registerAllTools(server, ctx);
registerPrompts(server);

// Override tools/list to emit JSON Schema 2020-12 instead of the SDK's default draft-07.
// The MCP SDK's toJsonSchemaCompat supports 2020-12 but McpServer doesn't expose a
// configuration option for the dialect. This runtime override is more robust than
// patch-package because it works even when npm install runs with --ignore-scripts
// (e.g. Homebrew).
const EMPTY_OBJECT_JSON_SCHEMA = {
  type: "object" as const,
  properties: {} as Record<string, never>,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const internalServer = (server as any).server;
// _registeredTools is internal SDK state; casting is required because it is private.
type InternalRegisteredTools = { _registeredTools: Record<string, RegisteredTool> };
const registeredTools = (server as unknown as InternalRegisteredTools)._registeredTools;

internalServer.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: Object.entries(registeredTools)
    .filter(([, tool]) => tool.enabled)
    .map(([name, tool]) => {
      const toolDefinition: Record<string, unknown> = {
        name,
        title: tool.title,
        description: tool.description,
        inputSchema: (() => {
          const obj = normalizeObjectSchema(tool.inputSchema);
          return obj
            ? toJsonSchemaCompat(obj, {
                strictUnions: true,
                pipeStrategy: "input",
                target: "draft-2020-12",
              })
            : EMPTY_OBJECT_JSON_SCHEMA;
        })(),
        annotations: tool.annotations,
        execution: tool.execution,
        _meta: tool._meta,
      };
      if (tool.outputSchema) {
        const obj = normalizeObjectSchema(tool.outputSchema);
        if (obj) {
          toolDefinition.outputSchema = toJsonSchemaCompat(obj, {
            strictUnions: true,
            pipeStrategy: "output",
            target: "draft-2020-12",
          });
        }
      }
      return toolDefinition;
    }),
}));

await startServer(server, ctx);
