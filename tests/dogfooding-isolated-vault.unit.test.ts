import { access, mkdtemp, mkdir, readFile, writeFile } from "fs/promises";
import { describe, expect, it } from "vitest";
import os from "os";
import path from "path";

import { createIsolatedDogfoodVault } from "../scripts/dogfooding-isolated-vault.mjs";

describe("isolated dogfood vault", () => {
  it("copies notes into a temporary isolated vault without modifying the source vault", async () => {
    const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "mnemonic-dogfood-source-"));
    const sourceVault = path.join(sourceRoot, ".mnemonic");
    await mkdir(path.join(sourceVault, "notes"), { recursive: true });
    await writeFile(
      path.join(sourceVault, "notes", "sample.md"),
      "---\ntitle: Sample\nlifecycle: permanent\n---\n\nhello",
      "utf-8"
    );

    const isolated = await createIsolatedDogfoodVault(sourceVault);

    const copied = await readFile(path.join(isolated.vaultPath, "notes", "sample.md"), "utf-8");
    expect(copied).toContain("title: Sample");
    expect(isolated.vaultPath).not.toBe(sourceVault);
  });

  it("does not copy local-only derived directories into the isolated vault", async () => {
    const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "mnemonic-dogfood-source-"));
    const sourceVault = path.join(sourceRoot, ".mnemonic");
    await mkdir(path.join(sourceVault, "notes"), { recursive: true });
    await mkdir(path.join(sourceVault, "embeddings"), { recursive: true });
    await mkdir(path.join(sourceVault, "projections"), { recursive: true });

    const isolated = await createIsolatedDogfoodVault(sourceVault);

    await expect(access(path.join(isolated.vaultPath, "embeddings"))).rejects.toThrow();
    await expect(access(path.join(isolated.vaultPath, "projections"))).rejects.toThrow();
  });
});