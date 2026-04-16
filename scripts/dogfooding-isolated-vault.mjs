import { mkdtemp, cp, rm } from "fs/promises";
import os from "os";
import path from "path";

export async function createIsolatedDogfoodVault(sourceVaultPath) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "mnemonic-dogfood-isolated-"));
  const targetVault = path.join(tempRoot, path.basename(sourceVaultPath));
  await cp(sourceVaultPath, targetVault, {
    recursive: true,
    filter(source) {
      const name = path.basename(source);
      return name !== "embeddings" && name !== "projections";
    },
  });

  return {
    tempRoot,
    vaultPath: targetVault,
    async cleanup() {
      await rm(tempRoot, { recursive: true, force: true });
    },
  };
}