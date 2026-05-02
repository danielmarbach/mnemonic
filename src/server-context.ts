import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MnemonicConfig, MnemonicConfigStore } from "./config.js";
import type { Migrator } from "./migration.js";
import type { VaultManager } from "./vault.js";

export interface ServerContext {
  readonly server: McpServer;
  readonly vaultManager: VaultManager;
  readonly configStore: MnemonicConfigStore;
  readonly config: MnemonicConfig;
  readonly migrator: Migrator;
  readonly vaultPath: string;
  readonly defaultRecallLimit: number;
  readonly defaultMinSimilarity: number;
  readonly projectScopeBoost: number;
  readonly temporalHistoryNoteLimit: number;
  readonly temporalHistoryCommitLimit: number;
}