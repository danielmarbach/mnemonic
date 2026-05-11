#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

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

await startServer(server, ctx);
