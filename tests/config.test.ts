import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import { MnemonicConfigStore } from "../src/config.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("MnemonicConfigStore", () => {
  it("uses defaults when config is missing", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mnemonic-config-"));
    tempDirs.push(dir);

    const store = new MnemonicConfigStore(dir);
    await expect(store.load()).resolves.toEqual({
      schemaVersion: "1.1",
      reindexEmbedConcurrency: 4,
      mutationPushMode: "main-only",
      projectMemoryPolicies: {},
      projectIdentityOverrides: {},
    });
  });

  it("loads and normalizes reindex concurrency from config", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mnemonic-config-"));
    tempDirs.push(dir);

    await fs.writeFile(
      path.join(dir, "config.json"),
      JSON.stringify({ reindexEmbedConcurrency: 99 }, null, 2),
      "utf-8"
    );

    const store = new MnemonicConfigStore(dir);
    await expect(store.load()).resolves.toEqual({
      schemaVersion: "1.1",
      reindexEmbedConcurrency: 16,
      mutationPushMode: "main-only",
      projectMemoryPolicies: {},
      projectIdentityOverrides: {},
    });
  });

  it("falls back to the default schema version for invalid config values", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mnemonic-config-"));
    tempDirs.push(dir);

    await fs.writeFile(
      path.join(dir, "config.json"),
      JSON.stringify({ schemaVersion: "vNext" }, null, 2),
      "utf-8"
    );

    const store = new MnemonicConfigStore(dir);
    await expect(store.load()).resolves.toEqual({
      schemaVersion: "1.1",
      reindexEmbedConcurrency: 4,
      mutationPushMode: "main-only",
      projectMemoryPolicies: {},
      projectIdentityOverrides: {},
    });
  });

  it("loads and normalizes mutation push mode from config", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mnemonic-config-"));
    tempDirs.push(dir);

    await fs.writeFile(
      path.join(dir, "config.json"),
      JSON.stringify({ mutationPushMode: "none" }, null, 2),
      "utf-8"
    );

    const store = new MnemonicConfigStore(dir);
    await expect(store.load()).resolves.toEqual({
      schemaVersion: "1.1",
      reindexEmbedConcurrency: 4,
      mutationPushMode: "none",
      projectMemoryPolicies: {},
      projectIdentityOverrides: {},
    });
  });

  it("falls back to the default mutation push mode for invalid values", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mnemonic-config-"));
    tempDirs.push(dir);

    await fs.writeFile(
      path.join(dir, "config.json"),
      JSON.stringify({ mutationPushMode: "sometimes" }, null, 2),
      "utf-8"
    );

    const store = new MnemonicConfigStore(dir);
    await expect(store.load()).resolves.toEqual({
      schemaVersion: "1.1",
      reindexEmbedConcurrency: 4,
      mutationPushMode: "main-only",
      projectMemoryPolicies: {},
      projectIdentityOverrides: {},
    });
  });

  it("stores and loads project identity overrides", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mnemonic-config-"));
    tempDirs.push(dir);

    const store = new MnemonicConfigStore(dir);
    await store.setProjectIdentityOverride("github-com-user-fork", {
      remoteName: "upstream",
      updatedAt: "2026-03-08T12:00:00.000Z",
    });

    await expect(store.getProjectIdentityOverride("github-com-user-fork")).resolves.toEqual({
      remoteName: "upstream",
      updatedAt: "2026-03-08T12:00:00.000Z",
    });
  });

});
