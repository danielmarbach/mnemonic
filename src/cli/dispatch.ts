import { runMigrateCli } from "./migrate.js";
import { runImportCli } from "./import-claude-memory.js";

export const CLI_COMMANDS = [
  { name: "migrate", description: "Apply pending schema migrations to vaults" },
  { name: "import-claude-memory", description: "Import Claude Code auto-memory into the vault" },
] as const;

export type CliCommand = (typeof CLI_COMMANDS)[number]["name"];

export function isCliCommand(arg: string): arg is CliCommand {
  return CLI_COMMANDS.some(c => c.name === arg);
}

export function showHelp(): never {
  const commandList = CLI_COMMANDS.map(c => `  ${c.name.padEnd(24)}${c.description}`).join("\n");
  console.log(`mnemonic — local MCP memory server backed by markdown + git

Usage:
  mnemonic <command> [options]    Run a CLI command
  mnemonic                        Start the MCP server (for MCP client config)

CLI commands:
${commandList}

MCP-only tools (not available from the CLI):
  sync, remember, recall, get, update, forget, list, consolidate, ...

  These tools are available through MCP clients (Claude Code, Cursor, etc.)
  that start the mnemonic server automatically. They cannot be run as
  CLI commands — use an MCP client session instead.

Options:
  --help, -h            Show this message

Examples:
  mnemonic migrate --dry-run
  mnemonic import-claude-memory --dry-run
  mnemonic              # starts the MCP server (used by MCP client config)
`);
  process.exit(0);
}

export function rejectUnknownCommand(command: string): never {
  console.error(`Unknown command: ${command}`);
  console.error();
  console.error(`Available CLI commands: ${CLI_COMMANDS.map(c => c.name).join(", ")}`);
  console.error();
  console.error("Tools like sync, remember, recall, etc. are MCP-only and");
  console.error("require an MCP client session. Run 'mnemonic --help' for details.");
  process.exit(1);
}

export async function runCliCommand(command: CliCommand): Promise<void> {
  switch (command) {
    case "migrate":
      await runMigrateCli().catch(err => {
        console.error("Migration failed:", err);
        process.exit(1);
      });
      process.exit(0);
    case "import-claude-memory":
      await runImportCli().catch(err => {
        console.error("Import failed:", err);
        process.exit(1);
      });
      process.exit(0);
    default: {
      const _exhaustive: never = command;
      throw new Error(`Unhandled CLI command: ${_exhaustive}`);
    }
  }
}