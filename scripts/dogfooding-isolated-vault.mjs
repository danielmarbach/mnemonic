import { execFile } from "child_process";
import { mkdtemp, cp, rm } from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

async function getOriginRemote(cwd) {
  try {
    const { stdout } = await execFileAsync("git", ["remote", "get-url", "origin"], { cwd });
    const remote = stdout.trim();
    return remote.length > 0 ? remote : null;
  } catch {
    return null;
  }
}

async function bootstrapIsolatedGitContext(sourceVaultPath, tempRoot) {
  const sourceRoot = path.dirname(sourceVaultPath);
  await execFileAsync("git", ["init", "-q"], { cwd: tempRoot });

  const originRemote = await getOriginRemote(sourceRoot);
  if (originRemote) {
    await execFileAsync("git", ["remote", "add", "origin", originRemote], { cwd: tempRoot });
  }
}

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
  await bootstrapIsolatedGitContext(sourceVaultPath, tempRoot);

  return {
    tempRoot,
    vaultPath: targetVault,
    async cleanup() {
      await rm(tempRoot, { recursive: true, force: true });
    },
  };
}

export async function runDogfoodInIsolation({ sourceVaultPath, dryRun = false }) {
  const isolated = await createIsolatedDogfoodVault(sourceVaultPath);
  const result = {
    usedIsolatedVault: true,
    vaultPath: isolated.vaultPath,
    tempRoot: isolated.tempRoot,
    cleanedUp: false,
  };
  await isolated.cleanup();
  result.cleanedUp = true;
  return result;
}
