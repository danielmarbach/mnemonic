import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import { MnemonicConfigStore, writeVaultSchemaVersion } from "../src/config.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map((dir) => fs.rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })),
  );
});

describe("MnemonicConfigStore", () => {
  it("uses defaults when config is missing", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mnemonic-config-"));
    tempDirs.push(dir);

    const store = new MnemonicConfigStore(dir);
    await expect(store.load()).resolves.toEqual({
      schemaVersion: "1.4",
      reindexEmbedConcurrency: 4,
      mutationPushMode: "main-only",
      projectMemoryPolicies: {},
      projectIdentityOverrides: {},
      projectAttachments: {},
      maxAttachmentsPerProject: 5,
    });
  });

  it("loads and normalizes reindex concurrency from config", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mnemonic-config-"));
    tempDirs.push(dir);

    await fs.writeFile(
      path.join(dir, "config.json"),
      JSON.stringify({ reindexEmbedConcurrency: 99 }, null, 2),
      "utf-8",
    );

    const store = new MnemonicConfigStore(dir);
    await expect(store.load()).resolves.toEqual({
      schemaVersion: "1.4",
      reindexEmbedConcurrency: 16,
      mutationPushMode: "main-only",
      projectMemoryPolicies: {},
      projectIdentityOverrides: {},
      projectAttachments: {},
      maxAttachmentsPerProject: 5,
    });
  });

  it("falls back to the default schema version for invalid config values", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mnemonic-config-"));
    tempDirs.push(dir);

    await fs.writeFile(
      path.join(dir, "config.json"),
      JSON.stringify({ schemaVersion: "vNext" }, null, 2),
      "utf-8",
    );

    const store = new MnemonicConfigStore(dir);
    await expect(store.load()).resolves.toEqual({
      schemaVersion: "1.4",
      reindexEmbedConcurrency: 4,
      mutationPushMode: "main-only",
      projectMemoryPolicies: {},
      projectIdentityOverrides: {},
      projectAttachments: {},
      maxAttachmentsPerProject: 5,
    });
  });

  it("loads and normalizes mutation push mode from config", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mnemonic-config-"));
    tempDirs.push(dir);

    await fs.writeFile(
      path.join(dir, "config.json"),
      JSON.stringify({ mutationPushMode: "none" }, null, 2),
      "utf-8",
    );

    const store = new MnemonicConfigStore(dir);
    await expect(store.load()).resolves.toEqual({
      schemaVersion: "1.4",
      reindexEmbedConcurrency: 4,
      mutationPushMode: "none",
      projectMemoryPolicies: {},
      projectIdentityOverrides: {},
      projectAttachments: {},
      maxAttachmentsPerProject: 5,
    });
  });

  it("falls back to the default mutation push mode for invalid values", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mnemonic-config-"));
    tempDirs.push(dir);

    await fs.writeFile(
      path.join(dir, "config.json"),
      JSON.stringify({ mutationPushMode: "sometimes" }, null, 2),
      "utf-8",
    );

    const store = new MnemonicConfigStore(dir);
    await expect(store.load()).resolves.toEqual({
      schemaVersion: "1.4",
      reindexEmbedConcurrency: 4,
      mutationPushMode: "main-only",
      projectMemoryPolicies: {},
      projectIdentityOverrides: {},
      projectAttachments: {},
      maxAttachmentsPerProject: 5,
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

  it("caches reads and invalidates on write", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mnemonic-config-"));
    tempDirs.push(dir);
    const configPath = path.join(dir, "config.json");

    const store = new MnemonicConfigStore(dir);
    const first = await store.load();
    expect(first.mutationPushMode).toBe("main-only");
    expect(first.projectMemoryPolicies).toEqual({});

    await fs.writeFile(configPath, JSON.stringify({ mutationPushMode: "none" }, null, 2), "utf-8");

    const cached = await store.load();
    expect(cached.mutationPushMode).toBe("main-only");

    store.invalidateCache();

    const refreshed = await store.load();
    expect(refreshed.mutationPushMode).toBe("none");
  });

  it("updates cache after write", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mnemonic-config-"));
    tempDirs.push(dir);

    const store = new MnemonicConfigStore(dir);
    await store.load();

    await store.setProjectPolicy({
      projectId: "project-x",
      projectName: "Project X",
      defaultScope: "project",
      consolidationMode: "supersedes",
      protectedBranchPatterns: undefined,
      protectedBranchBehavior: undefined,
      updatedAt: "2026-04-01T00:00:00.000Z",
    });

    await expect(store.getProjectPolicy("project-x")).resolves.toEqual({
      projectId: "project-x",
      projectName: "Project X",
      defaultScope: "project",
      consolidationMode: "supersedes",
      protectedBranchBehavior: undefined,
      protectedBranchPatterns: undefined,
      updatedAt: "2026-04-01T00:00:00.000Z",
    });

    const rawConfig = await fs.readFile(path.join(dir, "config.json"), "utf-8");
    const parsed = JSON.parse(rawConfig);
    expect(parsed.projectMemoryPolicies["project-x"].projectId).toBe("project-x");
  });

  it("returns defaults for an unparseable config but refuses to overwrite it", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mnemonic-config-"));
    tempDirs.push(dir);
    const configPath = path.join(dir, "config.json");
    const corrupt = '{ "mutationPushMode": "none", ';
    await fs.writeFile(configPath, corrupt, "utf-8");

    const store = new MnemonicConfigStore(dir);
    const loaded = await store.load();
    expect(loaded.mutationPushMode).toBe("main-only");
    expect(loaded.schemaVersion).toBe("1.4");

    await expect(store.setMaxAttachmentsPerProject(7)).rejects.toThrow(configPath);
    await expect(store.setMaxAttachmentsPerProject(7)).rejects.toThrow(/not valid JSON/);
    await expect(store.setSchemaVersion("1.5")).rejects.toThrow(/not valid JSON/);

    expect(await fs.readFile(configPath, "utf-8")).toBe(corrupt);
  });

  it("does not keep a refused write's mutation in the cache", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mnemonic-config-"));
    tempDirs.push(dir);
    await fs.writeFile(path.join(dir, "config.json"), "{bad", "utf-8");

    const store = new MnemonicConfigStore(dir);
    await expect(store.setMaxAttachmentsPerProject(9)).rejects.toThrow(/not valid JSON/);
    await expect(store.getMaxAttachmentsPerProject()).resolves.toBe(5);
  });

  it("removes the temp file when the rename fails", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mnemonic-config-"));
    tempDirs.push(dir);
    // A directory at the target path makes rename fail
    await fs.mkdir(path.join(dir, "config.json"));

    const store = new MnemonicConfigStore(dir);
    await expect(store.setMaxAttachmentsPerProject(9)).rejects.toThrow();
    await expect(fs.access(path.join(dir, "config.json.tmp"))).rejects.toThrow();
  });

  it("writes a valid config atomically and leaves no temp file behind", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mnemonic-config-"));
    tempDirs.push(dir);
    const configPath = path.join(dir, "config.json");
    await fs.writeFile(configPath, JSON.stringify({ mutationPushMode: "none" }), "utf-8");

    const store = new MnemonicConfigStore(dir);
    await store.setMaxAttachmentsPerProject(9);

    const parsed = JSON.parse(await fs.readFile(configPath, "utf-8"));
    expect(parsed.maxAttachmentsPerProject).toBe(9);
    expect(parsed.mutationPushMode).toBe("none");
    await expect(fs.access(`${configPath}.tmp`)).rejects.toThrow();
  });

  it("normalizes project memory policies loaded from config", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mnemonic-config-"));
    tempDirs.push(dir);

    await fs.writeFile(
      path.join(dir, "config.json"),
      JSON.stringify(
        {
          projectMemoryPolicies: {
            "project-a": {
              projectId: "project-a",
              projectName: "Project A",
              defaultScope: "not-a-scope",
              consolidationMode: "supersedes",
              protectedBranchBehavior: "sometimes",
              protectedBranchPatterns: ["main", "", 42],
              updatedAt: "2026-03-13T10:00:00.000Z",
            },
          },
        },
        null,
        2,
      ),
      "utf-8",
    );

    const store = new MnemonicConfigStore(dir);
    await expect(store.getProjectPolicy("project-a")).resolves.toEqual({
      projectId: "project-a",
      projectName: "Project A",
      defaultScope: "project",
      consolidationMode: "supersedes",
      protectedBranchBehavior: undefined,
      protectedBranchPatterns: ["main"],
      updatedAt: "2026-03-13T10:00:00.000Z",
    });
  });
});

describe("writeVaultSchemaVersion", () => {
  it("refuses to overwrite an unparseable config and leaves it byte-identical", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mnemonic-config-"));
    tempDirs.push(dir);
    const configPath = path.join(dir, "config.json");
    const corrupt = '{ "projectAttachments": { ';
    await fs.writeFile(configPath, corrupt, "utf-8");

    await expect(writeVaultSchemaVersion(dir, "1.5")).rejects.toThrow(
      /Refusing to write .*not valid JSON/,
    );
    expect(await fs.readFile(configPath, "utf-8")).toBe(corrupt);
  });

  it("refuses to overwrite a config that is not a JSON object", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mnemonic-config-"));
    tempDirs.push(dir);
    const configPath = path.join(dir, "config.json");
    await fs.writeFile(configPath, "[1, 2]", "utf-8");

    await expect(writeVaultSchemaVersion(dir, "1.5")).rejects.toThrow(/Refusing to write/);
    expect(await fs.readFile(configPath, "utf-8")).toBe("[1, 2]");
  });

  it("creates the config when it is missing", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mnemonic-config-"));
    tempDirs.push(dir);

    await writeVaultSchemaVersion(dir, "1.5");

    const parsed = JSON.parse(await fs.readFile(path.join(dir, "config.json"), "utf-8"));
    expect(parsed).toEqual({ schemaVersion: "1.5" });
  });

  it("updates only schemaVersion and keeps other keys in a valid config", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mnemonic-config-"));
    tempDirs.push(dir);
    const configPath = path.join(dir, "config.json");
    await fs.writeFile(
      configPath,
      JSON.stringify({ schemaVersion: "1.0", mutationPushMode: "none", custom: { a: 1 } }),
      "utf-8",
    );

    await writeVaultSchemaVersion(dir, "1.5");

    const parsed = JSON.parse(await fs.readFile(configPath, "utf-8"));
    expect(parsed).toEqual({ schemaVersion: "1.5", mutationPushMode: "none", custom: { a: 1 } });
    await expect(fs.access(`${configPath}.tmp`)).rejects.toThrow();
  });
});
