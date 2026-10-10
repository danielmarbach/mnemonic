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
      schemaVersion: "1.5",
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
      schemaVersion: "1.5",
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
      schemaVersion: "1.5",
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
      schemaVersion: "1.5",
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
      schemaVersion: "1.5",
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
    expect(loaded.schemaVersion).toBe("1.5");

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

describe("MnemonicConfigStore legacy project ids", () => {
  async function makeStoreWithConfig(
    config: Record<string, unknown>,
  ): Promise<{ store: MnemonicConfigStore; configPath: string }> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mnemonic-config-legacy-"));
    tempDirs.push(dir);
    const configPath = path.join(dir, "config.json");
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
    return { store: new MnemonicConfigStore(dir), configPath };
  }

  const policy = (projectId: string, defaultScope: string, updatedAt: string) => ({
    projectId,
    defaultScope,
    updatedAt,
  });

  it("reads legacy policy, override, and attachment ids as canonical ids", async () => {
    const { store } = await makeStoreWithConfig({
      schemaVersion: "1.4",
      projectMemoryPolicies: {
        "https-github-com-acme-myapp": policy(
          "https-github-com-acme-myapp",
          "global",
          "2026-01-01T00:00:00.000Z",
        ),
      },
      projectIdentityOverrides: {
        "http-github-com-acme-myapp": {
          remoteName: "upstream",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      },
      projectAttachments: {
        "https-github-com-acme-myapp": [
          {
            attachmentId: "att-1",
            projectSlug: "https-github-com-acme-lib",
            projectName: "lib",
            localPath: "/tmp/lib",
          },
        ],
      },
    });

    const config = await store.load();

    expect(Object.keys(config.projectMemoryPolicies)).toEqual(["github-com-acme-myapp"]);
    expect(config.projectMemoryPolicies["github-com-acme-myapp"]).toMatchObject({
      projectId: "github-com-acme-myapp",
      defaultScope: "global",
    });
    await expect(store.getProjectPolicy("github-com-acme-myapp")).resolves.toBeDefined();
    await expect(store.getProjectIdentityOverride("github-com-acme-myapp")).resolves.toEqual({
      remoteName: "upstream",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const attachments = await store.getProjectAttachments("github-com-acme-myapp");
    expect(attachments).toHaveLength(1);
    expect(attachments[0]).toMatchObject({
      attachmentId: "att-1",
      projectSlug: "github-com-acme-lib",
    });
  });

  it("canonicalizes the inner policy projectId independently of the key", async () => {
    const { store } = await makeStoreWithConfig({
      projectMemoryPolicies: {
        "github-com-acme-myapp": policy("https-github-com-acme-myapp", "project", ""),
      },
    });

    const config = await store.load();

    expect(config.projectMemoryPolicies["github-com-acme-myapp"]?.projectId).toBe(
      "github-com-acme-myapp",
    );
  });

  it("keeps the newer policy when legacy and canonical keys collide", async () => {
    const { store } = await makeStoreWithConfig({
      projectMemoryPolicies: {
        "github-com-acme-myapp": policy(
          "github-com-acme-myapp",
          "project",
          "2026-01-01T00:00:00.000Z",
        ),
        "https-github-com-acme-myapp": policy(
          "https-github-com-acme-myapp",
          "global",
          "2026-02-01T00:00:00.000Z",
        ),
      },
    });

    const config = await store.load();

    expect(Object.keys(config.projectMemoryPolicies)).toEqual(["github-com-acme-myapp"]);
    expect(config.projectMemoryPolicies["github-com-acme-myapp"]?.defaultScope).toBe("global");
  });

  it("keeps the canonical policy when a collision has no comparable timestamps", async () => {
    const { store } = await makeStoreWithConfig({
      projectMemoryPolicies: {
        "https-github-com-acme-myapp": policy("https-github-com-acme-myapp", "global", ""),
        "github-com-acme-myapp": policy("github-com-acme-myapp", "project", ""),
      },
    });

    const config = await store.load();

    expect(config.projectMemoryPolicies["github-com-acme-myapp"]?.defaultScope).toBe("project");
  });

  it("keeps the newer identity override when legacy and canonical keys collide", async () => {
    const { store } = await makeStoreWithConfig({
      projectIdentityOverrides: {
        "github-com-acme-myapp": { remoteName: "origin", updatedAt: "2026-01-01T00:00:00.000Z" },
        "https-github-com-acme-myapp": {
          remoteName: "upstream",
          updatedAt: "2026-02-01T00:00:00.000Z",
        },
      },
    });

    const config = await store.load();

    expect(config.projectIdentityOverrides).toEqual({
      "github-com-acme-myapp": { remoteName: "upstream", updatedAt: "2026-02-01T00:00:00.000Z" },
    });
  });

  it("keeps the canonical identity override when a collision has no timestamps", async () => {
    const { store } = await makeStoreWithConfig({
      projectIdentityOverrides: {
        "https-github-com-acme-myapp": { remoteName: "upstream" },
        "github-com-acme-myapp": { remoteName: "origin" },
      },
    });

    const config = await store.load();

    expect(config.projectIdentityOverrides["github-com-acme-myapp"]?.remoteName).toBe("origin");
  });

  it("concatenates colliding attachment lists and dedupes by slug and vault folder", async () => {
    const attachment = (attachmentId: string, projectSlug: string, vaultFolder: string) => ({
      attachmentId,
      projectSlug,
      projectName: "lib",
      localPath: "/tmp/lib",
      vaultFolder,
    });
    const { store } = await makeStoreWithConfig({
      projectAttachments: {
        "github-com-acme-myapp": [attachment("canonical-lib", "github-com-acme-lib", ".mnemonic")],
        "https-github-com-acme-myapp": [
          attachment("legacy-lib", "https-github-com-acme-lib", ".mnemonic"),
          attachment("legacy-other-folder", "https-github-com-acme-lib", ".other"),
        ],
      },
    });

    const attachments = await store.getProjectAttachments("github-com-acme-myapp");

    expect(attachments.map((a) => a.attachmentId)).toEqual([
      "canonical-lib",
      "legacy-other-folder",
    ]);
    expect(attachments.every((a) => a.projectSlug === "github-com-acme-lib")).toBe(true);
  });

  it("keeps legacy derived attachment ids stable when canonicalizing the slug", async () => {
    const entry = { projectName: "lib", localPath: "/tmp/lib" };
    const { store: legacyStore } = await makeStoreWithConfig({
      projectAttachments: {
        "https-github-com-acme-myapp": [{ ...entry, projectSlug: "https-github-com-acme-lib" }],
      },
    });
    const { store: plainStore } = await makeStoreWithConfig({
      projectAttachments: {
        "https-github-com-acme-myapp": [{ ...entry, projectSlug: "https-github-com-acme-lib" }],
      },
    });

    const [fromLegacy] = await legacyStore.getProjectAttachments("github-com-acme-myapp");
    const [fromPlain] = await plainStore.getProjectAttachments("github-com-acme-myapp");

    expect(fromLegacy?.attachmentId).toMatch(/^legacy-/);
    expect(fromLegacy?.attachmentId).toBe(fromPlain?.attachmentId);
  });

  it("writes only canonical ids after reading a legacy config", async () => {
    const { store, configPath } = await makeStoreWithConfig({
      schemaVersion: "1.4",
      projectMemoryPolicies: {
        "https-github-com-acme-myapp": policy("https-github-com-acme-myapp", "global", ""),
      },
      projectIdentityOverrides: {
        "https-github-com-acme-myapp": { remoteName: "upstream", updatedAt: "" },
      },
      projectAttachments: {
        "https-github-com-acme-myapp": [
          {
            attachmentId: "att-1",
            projectSlug: "https-github-com-acme-lib",
            projectName: "lib",
            localPath: "/tmp/lib",
          },
        ],
      },
    });

    await store.setMaxAttachmentsPerProject(7);

    const written = await fs.readFile(configPath, "utf-8");
    expect(written).not.toContain("https-");
    const parsed = JSON.parse(written);
    expect(Object.keys(parsed.projectMemoryPolicies)).toEqual(["github-com-acme-myapp"]);
    expect(parsed.projectMemoryPolicies["github-com-acme-myapp"].projectId).toBe(
      "github-com-acme-myapp",
    );
    expect(Object.keys(parsed.projectIdentityOverrides)).toEqual(["github-com-acme-myapp"]);
    expect(Object.keys(parsed.projectAttachments)).toEqual(["github-com-acme-myapp"]);
    expect(parsed.projectAttachments["github-com-acme-myapp"][0].projectSlug).toBe(
      "github-com-acme-lib",
    );
  });
});
