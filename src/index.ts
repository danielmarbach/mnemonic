#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/server";

import { registerAllTools } from "./tools/index.js";
import { registerPrompts } from "./prompts.js";
import { createServerContext, readPackageVersion } from "./context.js";
import { startServer } from "./startup.js";

// Register built-in document-source extractors at server startup.
// Must run before any tool that depends on extractor registry (sync, recall).
import "./init-extractors.js";
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

const server = new McpServer(
  {
    name: "mnemonic",
    version: await readPackageVersion(),
  },
  {
    cacheHints: {
      "tools/list": { ttlMs: 3_600_000, cacheScope: "private" as const },
    },
  },
);

registerAllTools(server, ctx);
registerPrompts(server);

await startServer(server, ctx);
