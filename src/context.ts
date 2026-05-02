import path from "path";
import { promises as fs } from "fs";

import { MnemonicConfigStore } from "./config.js";
import type { ServerContext } from "./server-context.js";
import { VaultManager } from "./vault.js";
import { PROJECT_SCOPE_BOOST } from "./tools/recall-helpers.js";
import { Migrator } from "./migration.js";
import { defaultVaultPath, resolveUserPath } from "./paths.js";

const DEFAULT_RECALL_LIMIT = 5;
const DEFAULT_MIN_SIMILARITY = 0.3;
const TEMPORAL_HISTORY_NOTE_LIMIT = 5;
const TEMPORAL_HISTORY_COMMIT_LIMIT = 5;

async function readPackageVersion(): Promise<string> {
  const packageJsonPath = path.resolve(import.meta.dirname, "../package.json");
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8")) as {
    version?: string;
  };

  return packageJson.version ?? "0.1.0";
}

export async function createServerContext(): Promise<ServerContext> {
  const vaultPath = process.env["VAULT_PATH"]
    ? resolveUserPath(process.env["VAULT_PATH"])
    : defaultVaultPath();

  const vaultManager = new VaultManager(vaultPath);
  await vaultManager.initMain();
  const configStore = new MnemonicConfigStore(vaultPath);
  const config = await configStore.load();
  const migrator = new Migrator(vaultManager);

  return {
    server: undefined as never,
    vaultManager,
    configStore,
    config,
    migrator,
    vaultPath,
    defaultRecallLimit: DEFAULT_RECALL_LIMIT,
    defaultMinSimilarity: DEFAULT_MIN_SIMILARITY,
    projectScopeBoost: PROJECT_SCOPE_BOOST,
    temporalHistoryNoteLimit: TEMPORAL_HISTORY_NOTE_LIMIT,
    temporalHistoryCommitLimit: TEMPORAL_HISTORY_COMMIT_LIMIT,
  };
}

export { readPackageVersion };
