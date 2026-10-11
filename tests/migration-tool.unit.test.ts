import { describe, it, expect } from "vitest";
import type { McpServer } from "@modelcontextprotocol/server";
import { registerExecuteMigrationTool } from "../src/tools/migration.js";
import type { MigrationResult } from "../src/migration.js";
import type { ServerContext } from "../src/server-context.js";

type ExecuteHandler = (args: {
  migrationName: string;
  dryRun: boolean;
  backup: boolean;
  cwd?: string;
}) => Promise<{ content: Array<{ type: "text"; text: string }> }>;

function migrationResult(overrides: Partial<MigrationResult>): MigrationResult {
  return {
    notesProcessed: 0,
    notesModified: 0,
    configModified: false,
    modifiedNoteIds: [],
    errors: [],
    warnings: [],
    ...overrides,
  };
}

async function executeMigrationText(result: MigrationResult): Promise<string> {
  let handler: ExecuteHandler | undefined;
  const server = {
    registerTool: (_name: string, _config: unknown, registered: ExecuteHandler) => {
      handler = registered;
    },
  } as unknown as McpServer;
  const ctx = {
    migrator: {
      runMigration: async () => ({
        results: new Map([["/vault", result]]),
        vaultsProcessed: 1,
      }),
    },
  } as unknown as ServerContext;

  registerExecuteMigrationTool(server, ctx);
  const response = await handler!({
    migrationName: "any-migration",
    dryRun: false,
    backup: true,
  });
  return response.content[0]!.text;
}

describe("execute_migration tool", () => {
  it("reports a config rewrite in the text output", async () => {
    const text = await executeMigrationText(migrationResult({ configModified: true }));

    expect(text).toContain("  Config modified: yes");
  });

  it("omits the config line when config.json was not rewritten", async () => {
    const text = await executeMigrationText(migrationResult({ configModified: false }));

    expect(text).not.toContain("Config modified");
  });
});
