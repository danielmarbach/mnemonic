import { access, mkdtemp, mkdir, writeFile } from "fs/promises";
import { describe, expect, it } from "vitest";
import os from "os";
import path from "path";

import { runDogfoodInIsolation } from "../scripts/dogfooding-isolated-vault.mjs";

describe("dogfood isolation runner", () => {
  it("creates and cleans up an isolated dogfood vault around a run", async () => {
    const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "mnemonic-dogfood-source-"));
    const sourceVault = path.join(sourceRoot, ".mnemonic");
    await mkdir(path.join(sourceVault, "notes"), { recursive: true });
    await writeFile(
      path.join(sourceVault, "notes", "sample.md"),
      "---\ntitle: Sample\nlifecycle: permanent\n---\n\nhello",
      "utf-8"
    );

    const result = await runDogfoodInIsolation({
      sourceVaultPath: sourceVault,
      dryRun: true,
    });

    expect(result.usedIsolatedVault).toBe(true);
    expect(result.vaultPath).not.toBe(sourceVault);
    await expect(access(path.join(result.tempRoot))).rejects.toThrow();
  });
});