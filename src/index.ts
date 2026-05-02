#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerAllTools } from "./tools/index.js";
import { registerPrompts } from "./prompts.js";
import { createServerContext, readPackageVersion } from "./context.js";
import { startServer } from "./startup.js";
import { runMigrateCli } from "./cli/migrate.js";
import { runImportCli } from "./cli/import-claude-memory.js";

// ── CLI commands ────────────────────────────────────────────────────────────────

if (process.argv[2] === "migrate") {
  await runMigrateCli().catch(err => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
  process.exit(0);
}

if (process.argv[2] === "import-claude-memory") {
  await runImportCli().catch(err => {
    console.error("Import failed:", err);
    process.exit(1);
  });
  process.exit(0);
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
