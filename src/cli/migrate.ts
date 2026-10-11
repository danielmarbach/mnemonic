import { resolveUserPath, defaultVaultPath } from "../paths.js";
import { VaultManager } from "../vault.js";
import { Migrator, type MigrationResult } from "../migration.js";
import { readVaultSchemaVersionForMigration } from "../config.js";

const AUTO_COMMIT_FAILED_PREFIX = "Auto-commit failed";

function hasAutoCommitFailure(result: MigrationResult): boolean {
  return result.warnings.some((warning) => warning.startsWith(AUTO_COMMIT_FAILED_PREFIX));
}

export function describeAutoCommit(result: MigrationResult): string {
  if (hasAutoCommitFailure(result)) return "✗ failed (changes written and staged, not committed)";
  return result.warnings.length === 0 ? "✓" : "⚠ (see warnings)";
}

export function buildMigrationCompletionLines(
  migrationResults: Map<string, { migration: string; result: MigrationResult }[]>,
): string[] {
  const failedVaults: string[] = [];
  for (const [vaultPath, results] of migrationResults) {
    if (results.some(({ result }) => hasAutoCommitFailure(result))) failedVaults.push(vaultPath);
  }

  if (failedVaults.length === 0) {
    return [
      "\n✓ Migration completed",
      "Changes were committed and pushed when a remote is configured.",
    ];
  }

  return [
    "\n⚠ Migration completed, but changes were NOT committed",
    "Changes were written and staged in these vaults but not committed or pushed:",
    ...failedVaults.map((vaultPath) => `  - ${vaultPath}`),
    "Commit them manually (fix the git error shown in the warnings, then commit and push).",
  ];
}

export async function runMigrateCli(): Promise<void> {
  const VAULT_PATH = process.env["VAULT_PATH"]
    ? resolveUserPath(process.env["VAULT_PATH"])
    : defaultVaultPath();

  const argv = process.argv.slice(3);

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
Mnemonic Migration Tool

Usage:
  mnemonic migrate [options]

Options:
  --dry-run     Show what would change without modifying files (STRONGLY RECOMMENDED)
  --cwd=<path>  Limit migration to specific project vault (/path/to/project)
  --list        Show available migrations and pending count
  --help        Show this help message

Workflow:
  1. Always use --dry-run first to see what will change
  2. Review the output carefully
  3. Run without --dry-run to execute and auto-commit

Examples:
  # Step 1: See what would change
  mnemonic migrate --dry-run

  # Step 2: Review, then execute (auto-commits changes)
  mnemonic migrate

  # For a specific project
  mnemonic migrate --dry-run --cwd=/path/to/project
  mnemonic migrate --cwd=/path/to/project
`);
    process.exit(0);
  }

  const dryRun = argv.includes("--dry-run");
  const cwdOption = argv.find((arg) => arg.startsWith("--cwd="));
  const targetCwd = cwdOption ? cwdOption.split("=")[1] : undefined;

  const vaultManager = new VaultManager(VAULT_PATH);
  await vaultManager.initMain();

  const migrator = new Migrator(vaultManager);

  if (argv.includes("--list")) {
    const migrations = migrator.listAvailableMigrations();
    console.log("Available migrations:");
    migrations.forEach((m) => console.log(`  ${m.name}: ${m.description}`));

    console.log("\nVault schema versions:");
    let totalPending = 0;
    for (const vault of vaultManager.allKnownVaults()) {
      const version = await readVaultSchemaVersionForMigration(vault.storage.vaultPath);
      const pending = await migrator.getPendingMigrations(version);
      totalPending += pending.length;
      const label = vault.provenance === "project-local" ? "project" : "main";
      console.log(
        `  ${label} (${vault.storage.vaultPath}): ${version} — ${pending.length} pending`,
      );
    }

    if (dryRun && totalPending > 0) {
      console.log("\n💡 Run without --dry-run to execute these migrations");
      console.log("   Changes will be automatically committed and pushed");
    }
    return;
  }

  if (dryRun) {
    console.log("Running migrations in dry-run mode...");
  } else {
    console.log("⚠️  Executing migrations (changes will be committed and pushed)...");
    console.log("   Use --dry-run first if you want to preview changes\n");
  }

  const { migrationResults, vaultsProcessed } = await migrator.runAllPending({
    dryRun,
    cwd: targetCwd,
  });

  for (const [vaultPath, results] of migrationResults) {
    console.log(`\nVault: ${vaultPath}`);
    for (const { migration, result } of results) {
      console.log(`  Migration ${migration}:`);
      console.log(`    Notes processed: ${result.notesProcessed}`);
      console.log(`    Notes modified: ${result.notesModified}`);
      if (result.configModified) {
        console.log("    Config modified: yes");
      }
      if (!dryRun && (result.notesModified > 0 || result.configModified)) {
        console.log(`    Auto-committed: ${describeAutoCommit(result)}`);
      }
      if (result.errors.length > 0) {
        console.log(`    Errors: ${result.errors.length}`);
        result.errors.forEach((e) => console.log(`      - ${e.noteId}: ${e.error}`));
      }
      if (result.warnings.length > 0) {
        console.log(`    Warnings: ${result.warnings.length}`);
        result.warnings.forEach((w) => console.log(`      - ${w}`));
      }
    }
  }

  if (!dryRun && vaultsProcessed > 0) {
    buildMigrationCompletionLines(migrationResults).forEach((line) => console.log(line));
  } else if (dryRun) {
    console.log("\n✓ Dry-run completed - no changes made");
    if (vaultsProcessed > 0) {
      console.log("\n💡 Ready to execute? Run: mnemonic migrate");
    }
  }
}
