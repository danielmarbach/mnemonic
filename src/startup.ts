import { readVaultSchemaVersion } from "./config.js";
import type { ServerContext } from "./server-context.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export async function warnAboutPendingMigrationsOnStartup(ctx: ServerContext): Promise<void> {
  let totalPending = 0;
  const details: string[] = [];

  for (const vault of ctx.vaultManager.allKnownVaults()) {
    const version = await readVaultSchemaVersion(vault.storage.vaultPath);
    const pending = await ctx.migrator.getPendingMigrations(version);
    if (pending.length === 0) {
      continue;
    }

    totalPending += pending.length;
    const label = vault.isProject ? "project" : "main";
    details.push(
      `${label} (${vault.storage.vaultPath}): ${pending.length} pending from schema ${version}`,
    );
  }

  if (totalPending === 0) {
    return;
  }

  console.error(
    `[mnemonic] ${totalPending} pending migration(s) detected - run "mnemonic migrate --dry-run" to preview`,
  );
  for (const detail of details) {
    console.error(`[mnemonic]   ${detail}`);
  }
}

export async function startServer(server: McpServer, ctx: ServerContext): Promise<void> {
  await warnAboutPendingMigrationsOnStartup(ctx);
  const transport = new StdioServerTransport();

  async function shutdown() {
    await server.close();
    process.exit(0);
  }
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  transport.onclose = async () => { await server.close(); };

  await server.connect(transport);
  console.error(`[mnemonic] Started. Main vault: ${ctx.vaultPath}`);
}
