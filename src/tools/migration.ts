import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../server-context.js";
import { readVaultSchemaVersion } from "../config.js";
import { MigrationListResultSchema, type MigrationListResult, MigrationExecuteResultSchema, type MigrationExecuteResult } from "../structured-content.js";
import { getErrorMessage } from "../error-utils.js";
import { ensureBranchSynced as ensureBranchSyncedFromModule, projectParam } from "../helpers/project.js";

export function registerListMigrationsTool(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "list_migrations",
    {
      title: "List Migrations",
      description:
        "List available schema migrations and show which ones are pending for each vault.\n\n" +
        "Use this when:\n" +
        "- Checking whether a mnemonic upgrade requires vault changes\n" +
        "- Preparing to run `execute_migration`\n\n" +
        "Do not use this when:\n" +
        "- You already know the exact migration to run and only need to execute it\n\n" +
        "Returns:\n" +
        "- Available migrations, vault schema versions, and pending counts\n\n" +
        "Read-only.\n\n" +
        "Typical next step:\n" +
        "- Run `execute_migration` with `dryRun: true` first.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: z.object({}),
      outputSchema: MigrationListResultSchema,
    },
    async () => {
      const available = ctx.migrator.listAvailableMigrations();
      const lines: string[] = [];

      lines.push("Vault schema versions:");
      let totalPending = 0;
      const vaultsInfo: MigrationListResult["vaults"] = [];
      for (const vault of ctx.vaultManager.allKnownVaults()) {
        const version = await readVaultSchemaVersion(vault.storage.vaultPath);
        const pending = await ctx.migrator.getPendingMigrations(version);
        totalPending += pending.length;
        const label = vault.isProject ? "project" : "main";
        lines.push(`  ${label} (${vault.storage.vaultPath}): ${version} — ${pending.length} pending`);
        vaultsInfo.push({
          path: vault.storage.vaultPath,
          type: vault.isProject ? "project" : "main",
          version,
          pending: pending.length,
        });
      }

      lines.push("");
      lines.push("Available migrations:");
      for (const migration of available) {
        lines.push(`  ${migration.name}`);
        lines.push(`   ${migration.description}`);
      }

      lines.push("");
      if (totalPending > 0) {
        lines.push("Run migration with: mnemonic migrate (CLI) or execute_migration (MCP)");
      }

      const structuredContent: MigrationListResult = {
        action: "migration_list",
        vaults: vaultsInfo,
        available: available.map(m => ({ name: m.name, description: m.description })),
        totalPending,
      };

      return { content: [{ type: "text", text: lines.join("\n") }], structuredContent };
    }
  );
}

export function registerExecuteMigrationTool(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "execute_migration",
    {
      title: "Execute Migration",
      description:
        "Execute a named schema migration on vault notes.\n\n" +
        "Use this when:\n" +
        "- `list_migrations` shows pending migrations that should be applied\n\n" +
        "Do not use this when:\n" +
        "- You have not checked pending migrations yet\n" +
        "- You have not previewed the migration with `dryRun: true`\n\n" +
        "Returns:\n" +
        "- Per-vault migration results, counts, warnings, and errors\n\n" +
        "Side effects: modifies note files, git commits per affected vault, and may push.\n\n" +
        "Typical next step:\n" +
        "- Re-run `list_migrations` to confirm nothing is pending.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: z.object({
        migrationName: z.string().describe("Name of the migration to execute (get names from `list_migrations`)"),
        dryRun: z.boolean().default(true).describe("If true, show what would change without actually modifying notes. Always try dry-run first."),
        backup: z.boolean().default(true).describe("If true, warn about backing up before real migration"),
        cwd: projectParam.optional().describe("Optional: limit migration to a specific project vault"),
      }),
      outputSchema: MigrationExecuteResultSchema,
    },
    async ({ migrationName, dryRun, backup, cwd }) => {
      await ensureBranchSyncedFromModule(ctx, cwd);

      try {
        const { results, vaultsProcessed } = await ctx.migrator.runMigration(migrationName, {
          dryRun,
          backup,
          cwd,
        });
        
        const lines: string[] = [];
        lines.push(`Migration: ${migrationName}`);
        lines.push(`Mode: ${dryRun ? "DRY-RUN" : "EXECUTE"}`);
        lines.push(`Vaults processed: ${vaultsProcessed}`);
        lines.push("")
        
        const vaultResults: Array<{ path: string; notesProcessed: number; notesModified: number; errors: Array<{ noteId: string; error: string }>; warnings: string[] }> = [];
        for (const [vaultPath, result] of results) {
          lines.push(`Vault: ${vaultPath}`);
          lines.push(`  Notes processed: ${result.notesProcessed}`);
          lines.push(`  Notes modified: ${result.notesModified}`);
          
          const vaultResultErrors: Array<{ noteId: string; error: string }> = [];
          const vaultResultWarnings: string[] = [];
          
          if (result.errors.length > 0) {
            lines.push(`  Errors: ${result.errors.length}`);
            result.errors.forEach(e => lines.push(`    - ${e.noteId}: ${e.error}`));
            vaultResultErrors.push(...result.errors.map(e => ({ noteId: e.noteId, error: e.error })));
          }
          
          if (result.warnings.length > 0) {
            lines.push(`  Warnings: ${result.warnings.length}`);
            result.warnings.forEach(w => lines.push(`    - ${w}`));
            vaultResultWarnings.push(...result.warnings);
          }
          
          vaultResults.push({
            path: vaultPath,
            notesProcessed: result.notesProcessed,
            notesModified: result.notesModified,
            errors: vaultResultErrors,
            warnings: vaultResultWarnings,
          });
          lines.push("");
        }
        
        if (!dryRun) {
          lines.push("Migration executed. Modified vaults were auto-committed and pushed when git was available.");
        } else {
          lines.push("✓ Dry-run completed - no changes made");
        }
        
        const structuredContent: MigrationExecuteResult = {
          action: "migration_executed",
          migration: migrationName,
          dryRun,
          vaultsProcessed,
          vaultResults,
        };
        
        return { content: [{ type: "text", text: lines.join("\n") }], structuredContent };
      } catch (err) {
        return {
          content: [{
            type: "text",
            text: `Migration failed: ${getErrorMessage(err)}`,
          }],
        };
      }
    }
  );
}
