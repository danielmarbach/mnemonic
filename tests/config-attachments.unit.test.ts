import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import path from "path";
import os from "os";

import { MnemonicConfigStore } from "../src/config.js";
import type { ProjectAttachmentConfig } from "../src/vault.js";

describe("normalizeProjectAttachments", () => {
  let tempDir: string;
  let configStore: MnemonicConfigStore;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mnemonic-config-attach-test-"));
    configStore = new MnemonicConfigStore(tempDir);
    await fs.mkdir(path.join(tempDir), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function writeConfig(data: Record<string, unknown>): Promise<void> {
    await fs.writeFile(
      path.join(tempDir, "config.json"),
      JSON.stringify(data, null, 2) + "\n",
      "utf-8"
    );
    configStore.invalidateCache();
  }

  async function readConfigAttachments(): Promise<Record<string, ProjectAttachmentConfig[]>> {
    const config = await configStore.load();
    return config.projectAttachments;
  }

  it("returns empty object for null input", async () => {
    await writeConfig({ schemaVersion: "1.2", projectAttachments: null });
    const result = await readConfigAttachments();
    expect(result).toEqual({});
  });

  it("returns empty object for undefined input", async () => {
    await writeConfig({ schemaVersion: "1.2" });
    const result = await readConfigAttachments();
    expect(result).toEqual({});
  });

  it("returns empty object for non-object input", async () => {
    await writeConfig({ schemaVersion: "1.2", projectAttachments: "bad" });
    const result = await readConfigAttachments();
    expect(result).toEqual({});
  });

  it("returns empty object for number input", async () => {
    await writeConfig({ schemaVersion: "1.2", projectAttachments: 42 });
    const result = await readConfigAttachments();
    expect(result).toEqual({});
  });

  it("returns empty object for empty array input", async () => {
    await writeConfig({ schemaVersion: "1.2", projectAttachments: [] });
    const result = await readConfigAttachments();
    expect(result).toEqual({});
  });

  it("normalizes valid attachment config", async () => {
    const attachment = {
      projectSlug: "my-org/my-repo",
      projectName: "My Repo",
      localPath: "/home/user/projects/my-repo",
      vaultFolder: ".mnemonic",
      enabled: true,
      branch: "develop",
      addedAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-02T00:00:00Z",
      branchTipHash: "abc123",
    };
    await writeConfig({
      schemaVersion: "1.2",
      projectAttachments: { "proj-1": [attachment] },
    });
    const result = await readConfigAttachments();
    expect(result["proj-1"]).toHaveLength(1);
    expect(result["proj-1"][0]).toEqual(attachment);
  });

  it("filters out entries with missing projectSlug", async () => {
    await writeConfig({
      schemaVersion: "1.2",
      projectAttachments: {
        "proj-1": [
          { localPath: "/path/to/repo" },
        ],
      },
    });
    const result = await readConfigAttachments();
    expect(result).toEqual({});
  });

  it("filters out entries with empty projectSlug", async () => {
    await writeConfig({
      schemaVersion: "1.2",
      projectAttachments: {
        "proj-1": [
          { projectSlug: "   ", localPath: "/path" },
        ],
      },
    });
    const result = await readConfigAttachments();
    expect(result).toEqual({});
  });

  it("filters out entries with non-string projectSlug", async () => {
    await writeConfig({
      schemaVersion: "1.2",
      projectAttachments: {
        "proj-1": [
          { projectSlug: 123, localPath: "/path" },
        ],
      },
    });
    const result = await readConfigAttachments();
    expect(result).toEqual({});
  });

  it("filters out entries with missing localPath", async () => {
    await writeConfig({
      schemaVersion: "1.2",
      projectAttachments: {
        "proj-1": [
          { projectSlug: "org/repo" },
        ],
      },
    });
    const result = await readConfigAttachments();
    expect(result).toEqual({});
  });

  it("filters out entries with empty localPath", async () => {
    await writeConfig({
      schemaVersion: "1.2",
      projectAttachments: {
        "proj-1": [
          { projectSlug: "org/repo", localPath: "  " },
        ],
      },
    });
    const result = await readConfigAttachments();
    expect(result).toEqual({});
  });

  it("filters out entries with non-string localPath", async () => {
    await writeConfig({
      schemaVersion: "1.2",
      projectAttachments: {
        "proj-1": [
          { projectSlug: "org/repo", localPath: 42 },
        ],
      },
    });
    const result = await readConfigAttachments();
    expect(result).toEqual({});
  });

  it("filters out non-object entries within array", async () => {
    await writeConfig({
      schemaVersion: "1.2",
      projectAttachments: {
        "proj-1": ["string", 42, null, true],
      },
    });
    const result = await readConfigAttachments();
    expect(result).toEqual({});
  });

  it("filters out null entries within array", async () => {
    await writeConfig({
      schemaVersion: "1.2",
      projectAttachments: {
        "proj-1": [null, { projectSlug: "org/repo", localPath: "/path" }],
      },
    });
    const result = await readConfigAttachments();
    expect(result["proj-1"]).toHaveLength(1);
    expect(result["proj-1"][0].projectSlug).toBe("org/repo");
  });

  it("skips project keys with no valid attachments after filtering", async () => {
    await writeConfig({
      schemaVersion: "1.2",
      projectAttachments: {
        "proj-1": [{ projectSlug: "org/repo" }],
        "proj-2": [{ projectSlug: "valid/repo", localPath: "/valid" }],
      },
    });
    const result = await readConfigAttachments();
    expect(result["proj-1"]).toBeUndefined();
    expect(result["proj-2"]).toHaveLength(1);
  });

  it("defaults projectName to projectSlug when missing", async () => {
    await writeConfig({
      schemaVersion: "1.2",
      projectAttachments: {
        "proj-1": [{ projectSlug: "org/repo", localPath: "/path" }],
      },
    });
    const result = await readConfigAttachments();
    expect(result["proj-1"][0].projectName).toBe("org/repo");
  });

  it("defaults projectName to projectSlug when non-string", async () => {
    await writeConfig({
      schemaVersion: "1.2",
      projectAttachments: {
        "proj-1": [{ projectSlug: "org/repo", localPath: "/path", projectName: 42 }],
      },
    });
    const result = await readConfigAttachments();
    expect(result["proj-1"][0].projectName).toBe("org/repo");
  });

  it("trims projectName", async () => {
    await writeConfig({
      schemaVersion: "1.2",
      projectAttachments: {
        "proj-1": [{ projectSlug: "org/repo", localPath: "/path", projectName: "  My Repo  " }],
      },
    });
    const result = await readConfigAttachments();
    expect(result["proj-1"][0].projectName).toBe("My Repo");
  });

  it("defaults vaultFolder to .mnemonic when missing", async () => {
    await writeConfig({
      schemaVersion: "1.2",
      projectAttachments: {
        "proj-1": [{ projectSlug: "org/repo", localPath: "/path" }],
      },
    });
    const result = await readConfigAttachments();
    expect(result["proj-1"][0].vaultFolder).toBe(".mnemonic");
  });

  it("defaults vaultFolder to .mnemonic when empty string", async () => {
    await writeConfig({
      schemaVersion: "1.2",
      projectAttachments: {
        "proj-1": [{ projectSlug: "org/repo", localPath: "/path", vaultFolder: "" }],
      },
    });
    const result = await readConfigAttachments();
    expect(result["proj-1"][0].vaultFolder).toBe(".mnemonic");
  });

  it("defaults vaultFolder to .mnemonic when whitespace-only", async () => {
    await writeConfig({
      schemaVersion: "1.2",
      projectAttachments: {
        "proj-1": [{ projectSlug: "org/repo", localPath: "/path", vaultFolder: "   " }],
      },
    });
    const result = await readConfigAttachments();
    expect(result["proj-1"][0].vaultFolder).toBe(".mnemonic");
  });

  it("defaults enabled to true when missing", async () => {
    await writeConfig({
      schemaVersion: "1.2",
      projectAttachments: {
        "proj-1": [{ projectSlug: "org/repo", localPath: "/path" }],
      },
    });
    const result = await readConfigAttachments();
    expect(result["proj-1"][0].enabled).toBe(true);
  });

  it("defaults enabled to true when non-boolean", async () => {
    await writeConfig({
      schemaVersion: "1.2",
      projectAttachments: {
        "proj-1": [{ projectSlug: "org/repo", localPath: "/path", enabled: "yes" }],
      },
    });
    const result = await readConfigAttachments();
    expect(result["proj-1"][0].enabled).toBe(true);
  });

  it("preserves enabled when false", async () => {
    await writeConfig({
      schemaVersion: "1.2",
      projectAttachments: {
        "proj-1": [{ projectSlug: "org/repo", localPath: "/path", enabled: false }],
      },
    });
    const result = await readConfigAttachments();
    expect(result["proj-1"][0].enabled).toBe(false);
  });

  it("defaults branch to main when missing", async () => {
    await writeConfig({
      schemaVersion: "1.2",
      projectAttachments: {
        "proj-1": [{ projectSlug: "org/repo", localPath: "/path" }],
      },
    });
    const result = await readConfigAttachments();
    expect(result["proj-1"][0].branch).toBe("main");
  });

  it("defaults branch to main when non-string", async () => {
    await writeConfig({
      schemaVersion: "1.2",
      projectAttachments: {
        "proj-1": [{ projectSlug: "org/repo", localPath: "/path", branch: 123 }],
      },
    });
    const result = await readConfigAttachments();
    expect(result["proj-1"][0].branch).toBe("main");
  });

  it("defaults addedAt to empty string when missing", async () => {
    await writeConfig({
      schemaVersion: "1.2",
      projectAttachments: {
        "proj-1": [{ projectSlug: "org/repo", localPath: "/path" }],
      },
    });
    const result = await readConfigAttachments();
    expect(result["proj-1"][0].addedAt).toBe("");
  });

  it("defaults updatedAt to empty string when missing", async () => {
    await writeConfig({
      schemaVersion: "1.2",
      projectAttachments: {
        "proj-1": [{ projectSlug: "org/repo", localPath: "/path" }],
      },
    });
    const result = await readConfigAttachments();
    expect(result["proj-1"][0].updatedAt).toBe("");
  });

  it("defaults branchTipHash to empty string when missing", async () => {
    await writeConfig({
      schemaVersion: "1.2",
      projectAttachments: {
        "proj-1": [{ projectSlug: "org/repo", localPath: "/path" }],
      },
    });
    const result = await readConfigAttachments();
    expect(result["proj-1"][0].branchTipHash).toBe("");
  });

  it("trims projectSlug and localPath", async () => {
    await writeConfig({
      schemaVersion: "1.2",
      projectAttachments: {
        "proj-1": [{ projectSlug: "  org/repo  ", localPath: "  /path/to/repo  " }],
      },
    });
    const result = await readConfigAttachments();
    expect(result["proj-1"][0].projectSlug).toBe("org/repo");
    expect(result["proj-1"][0].localPath).toBe("/path/to/repo");
  });

  it("trims vaultFolder", async () => {
    await writeConfig({
      schemaVersion: "1.2",
      projectAttachments: {
        "proj-1": [{ projectSlug: "org/repo", localPath: "/path", vaultFolder: "  .custom  " }],
      },
    });
    const result = await readConfigAttachments();
    expect(result["proj-1"][0].vaultFolder).toBe(".custom");
  });

  it("handles multiple projects with attachments", async () => {
    const att1 = { projectSlug: "org/a", localPath: "/a", enabled: true };
    const att2 = { projectSlug: "org/b", localPath: "/b", enabled: false };
    await writeConfig({
      schemaVersion: "1.2",
      projectAttachments: {
        "proj-1": [att1],
        "proj-2": [att2],
      },
    });
    const result = await readConfigAttachments();
    expect(Object.keys(result)).toHaveLength(2);
    expect(result["proj-1"]).toHaveLength(1);
    expect(result["proj-2"]).toHaveLength(1);
  });

  it("handles multiple attachments per project", async () => {
    const att1 = { projectSlug: "org/a", localPath: "/a" };
    const att2 = { projectSlug: "org/b", localPath: "/b" };
    await writeConfig({
      schemaVersion: "1.2",
      projectAttachments: {
        "proj-1": [att1, att2],
      },
    });
    const result = await readConfigAttachments();
    expect(result["proj-1"]).toHaveLength(2);
  });

  it("filters out non-array values in projectAttachments", async () => {
    await writeConfig({
      schemaVersion: "1.2",
      projectAttachments: {
        "proj-1": "not-an-array",
        "proj-2": 42,
        "proj-3": null,
      },
    });
    const result = await readConfigAttachments();
    expect(result).toEqual({});
  });
});

describe("maxAttachmentsPerProject", () => {
  let tempDir: string;
  let configStore: MnemonicConfigStore;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mnemonic-config-max-test-"));
    configStore = new MnemonicConfigStore(tempDir);
    await fs.mkdir(path.join(tempDir), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function writeConfig(data: Record<string, unknown>): Promise<void> {
    await fs.writeFile(
      path.join(tempDir, "config.json"),
      JSON.stringify(data, null, 2) + "\n",
      "utf-8"
    );
    configStore.invalidateCache();
  }

  it("defaults to 5 when not present in config", async () => {
    await writeConfig({ schemaVersion: "1.2" });
    const result = await configStore.getMaxAttachmentsPerProject();
    expect(result).toBe(5);
  });

  it("defaults to 5 when config file does not exist", async () => {
    const result = await configStore.getMaxAttachmentsPerProject();
    expect(result).toBe(5);
  });

  it("reads a valid custom value", async () => {
    await writeConfig({ schemaVersion: "1.2", maxAttachmentsPerProject: 10 });
    const result = await configStore.getMaxAttachmentsPerProject();
    expect(result).toBe(10);
  });

  it("floors fractional values", async () => {
    await writeConfig({ schemaVersion: "1.2", maxAttachmentsPerProject: 7.9 });
    const result = await configStore.getMaxAttachmentsPerProject();
    expect(result).toBe(7);
  });

  it("clamps values below 1 to 1", async () => {
    await writeConfig({ schemaVersion: "1.2", maxAttachmentsPerProject: 0 });
    const result = await configStore.getMaxAttachmentsPerProject();
    expect(result).toBe(1);
  });

  it("clamps negative values to 1", async () => {
    await writeConfig({ schemaVersion: "1.2", maxAttachmentsPerProject: -5 });
    const result = await configStore.getMaxAttachmentsPerProject();
    expect(result).toBe(1);
  });

  it("clamps values above 20 to 20", async () => {
    await writeConfig({ schemaVersion: "1.2", maxAttachmentsPerProject: 100 });
    const result = await configStore.getMaxAttachmentsPerProject();
    expect(result).toBe(20);
  });

  it("defaults to 5 for non-number input", async () => {
    await writeConfig({ schemaVersion: "1.2", maxAttachmentsPerProject: "big" });
    const result = await configStore.getMaxAttachmentsPerProject();
    expect(result).toBe(5);
  });

  it("defaults to 5 for NaN input", async () => {
    await writeConfig({ schemaVersion: "1.2", maxAttachmentsPerProject: NaN });
    const result = await configStore.getMaxAttachmentsPerProject();
    expect(result).toBe(5);
  });

  it("defaults to 5 for Infinity input", async () => {
    await writeConfig({ schemaVersion: "1.2", maxAttachmentsPerProject: Infinity });
    const result = await configStore.getMaxAttachmentsPerProject();
    expect(result).toBe(5);
  });

  it("sets a valid custom value via setMaxAttachmentsPerProject", async () => {
    await writeConfig({ schemaVersion: "1.2" });
    await configStore.setMaxAttachmentsPerProject(12);
    const result = await configStore.getMaxAttachmentsPerProject();
    expect(result).toBe(12);
  });

  it("clamps via setMaxAttachmentsPerProject below 1", async () => {
    await writeConfig({ schemaVersion: "1.2" });
    await configStore.setMaxAttachmentsPerProject(0);
    const result = await configStore.getMaxAttachmentsPerProject();
    expect(result).toBe(1);
  });

  it("clamps via setMaxAttachmentsPerProject above 20", async () => {
    await writeConfig({ schemaVersion: "1.2" });
    await configStore.setMaxAttachmentsPerProject(50);
    const result = await configStore.getMaxAttachmentsPerProject();
    expect(result).toBe(20);
  });

  it("persists value after cache invalidation", async () => {
    await writeConfig({ schemaVersion: "1.2" });
    await configStore.setMaxAttachmentsPerProject(8);
    configStore.invalidateCache();
    const result = await configStore.getMaxAttachmentsPerProject();
    expect(result).toBe(8);
  });
});

describe("Schema migration for projectAttachments", () => {
  let tempDir: string;
  let configStore: MnemonicConfigStore;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mnemonic-config-migration-test-"));
    configStore = new MnemonicConfigStore(tempDir);
    await fs.mkdir(path.join(tempDir), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function writeConfig(data: Record<string, unknown>): Promise<void> {
    await fs.writeFile(
      path.join(tempDir, "config.json"),
      JSON.stringify(data, null, 2) + "\n",
      "utf-8"
    );
    configStore.invalidateCache();
  }

  it("provides empty projectAttachments for schema 1.1 without the field", async () => {
    await writeConfig({ schemaVersion: "1.1", reindexEmbedConcurrency: 4 });
    const config = await configStore.load();
    expect(config.projectAttachments).toEqual({});
  });

  it("provides default maxAttachmentsPerProject for schema 1.1 without the field", async () => {
    await writeConfig({ schemaVersion: "1.1", reindexEmbedConcurrency: 4 });
    const config = await configStore.load();
    expect(config.maxAttachmentsPerProject).toBe(5);
  });

  it("allows projectAttachments in schema 1.2", async () => {
    const attachment = {
      projectSlug: "org/repo",
      localPath: "/path/to/repo",
      vaultFolder: ".mnemonic",
      enabled: true,
      branch: "main",
    };
    await writeConfig({
      schemaVersion: "1.2",
      projectAttachments: { "proj-1": [attachment] },
    });
    const config = await configStore.load();
    expect(Object.keys(config.projectAttachments)).toHaveLength(1);
    expect(config.projectAttachments["proj-1"]).toHaveLength(1);
  });

  it("provides empty projectAttachments for fresh config (no file)", async () => {
    const config = await configStore.load();
    expect(config.projectAttachments).toEqual({});
    expect(config.maxAttachmentsPerProject).toBe(5);
  });

  it("preserves projectAttachments through read/write cycle", async () => {
    const attachment: ProjectAttachmentConfig = {
      projectSlug: "org/repo",
      projectName: "Repo",
      localPath: "/path/to/repo",
      vaultFolder: ".mnemonic",
      enabled: true,
      branch: "main",
      addedAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-02T00:00:00Z",
      branchTipHash: "abc123",
    };
    await configStore.load();
    await configStore.setProjectAttachments("proj-1", [attachment]);
    configStore.invalidateCache();
    const result = await configStore.getProjectAttachments("proj-1");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(attachment);
  });
});

describe("getProjectAttachments / setProjectAttachments", () => {
  let tempDir: string;
  let configStore: MnemonicConfigStore;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mnemonic-config-attach-rw-test-"));
    configStore = new MnemonicConfigStore(tempDir);
    await fs.mkdir(path.join(tempDir), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("returns empty array for unknown project", async () => {
    const result = await configStore.getProjectAttachments("unknown-proj");
    expect(result).toEqual([]);
  });

  it("sets and gets attachments for a project", async () => {
    const attachment: ProjectAttachmentConfig = {
      projectSlug: "org/repo",
      projectName: "My Repo",
      localPath: "/home/user/repo",
      vaultFolder: ".mnemonic",
      enabled: true,
      branch: "develop",
      addedAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-02T00:00:00Z",
      branchTipHash: "deadbeef",
    };
    await configStore.load();
    await configStore.setProjectAttachments("proj-1", [attachment]);
    const result = await configStore.getProjectAttachments("proj-1");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(attachment);
  });

  it("overwrites existing attachments for a project", async () => {
    const att1: ProjectAttachmentConfig = {
      projectSlug: "org/repo-a",
      projectName: "Repo A",
      localPath: "/a",
      vaultFolder: ".mnemonic",
      enabled: true,
      branch: "main",
      addedAt: "",
      updatedAt: "",
      branchTipHash: "",
    };
    const att2: ProjectAttachmentConfig = {
      projectSlug: "org/repo-b",
      projectName: "Repo B",
      localPath: "/b",
      vaultFolder: ".mnemonic",
      enabled: true,
      branch: "main",
      addedAt: "",
      updatedAt: "",
      branchTipHash: "",
    };
    await configStore.load();
    await configStore.setProjectAttachments("proj-1", [att1]);
    await configStore.setProjectAttachments("proj-1", [att2]);
    const result = await configStore.getProjectAttachments("proj-1");
    expect(result).toHaveLength(1);
    expect(result[0].projectSlug).toBe("org/repo-b");
  });

  it("persists attachments across cache invalidation", async () => {
    const attachment: ProjectAttachmentConfig = {
      projectSlug: "org/repo",
      projectName: "My Repo",
      localPath: "/path",
      vaultFolder: ".mnemonic",
      enabled: true,
      branch: "main",
      addedAt: "",
      updatedAt: "",
      branchTipHash: "",
    };
    await configStore.load();
    await configStore.setProjectAttachments("proj-1", [attachment]);
    configStore.invalidateCache();
    const result = await configStore.getProjectAttachments("proj-1");
    expect(result).toHaveLength(1);
    expect(result[0].projectSlug).toBe("org/repo");
  });

  it("handles multiple projects independently", async () => {
    const att1: ProjectAttachmentConfig = {
      projectSlug: "org/a",
      projectName: "A",
      localPath: "/a",
      vaultFolder: ".mnemonic",
      enabled: true,
      branch: "main",
      addedAt: "",
      updatedAt: "",
      branchTipHash: "",
    };
    const att2: ProjectAttachmentConfig = {
      projectSlug: "org/b",
      projectName: "B",
      localPath: "/b",
      vaultFolder: ".mnemonic",
      enabled: false,
      branch: "develop",
      addedAt: "2025-03-01T00:00:00Z",
      updatedAt: "2025-03-02T00:00:00Z",
      branchTipHash: "cafe",
    };
    await configStore.load();
    await configStore.setProjectAttachments("proj-1", [att1]);
    await configStore.setProjectAttachments("proj-2", [att2]);

    const result1 = await configStore.getProjectAttachments("proj-1");
    const result2 = await configStore.getProjectAttachments("proj-2");

    expect(result1).toHaveLength(1);
    expect(result1[0].projectSlug).toBe("org/a");
    expect(result2).toHaveLength(1);
    expect(result2[0].projectSlug).toBe("org/b");
  });

  it("persists multiple attachments per project", async () => {
    const attachments: ProjectAttachmentConfig[] = [
      {
        projectSlug: "org/a",
        projectName: "A",
        localPath: "/a",
        vaultFolder: ".mnemonic",
        enabled: true,
        branch: "main",
        addedAt: "",
        updatedAt: "",
        branchTipHash: "",
      },
      {
        projectSlug: "org/b",
        projectName: "B",
        localPath: "/b",
        vaultFolder: ".mnemonic-lib",
        enabled: false,
        branch: "dev",
        addedAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-02T00:00:00Z",
        branchTipHash: "abcd",
      },
    ];
    await configStore.load();
    await configStore.setProjectAttachments("proj-1", attachments);
    const result = await configStore.getProjectAttachments("proj-1");
    expect(result).toHaveLength(2);
    expect(result[0].projectSlug).toBe("org/a");
    expect(result[1].projectSlug).toBe("org/b");
  });

  it("returns empty array after setting empty array", async () => {
    const attachment: ProjectAttachmentConfig = {
      projectSlug: "org/repo",
      projectName: "My Repo",
      localPath: "/path",
      vaultFolder: ".mnemonic",
      enabled: true,
      branch: "main",
      addedAt: "",
      updatedAt: "",
      branchTipHash: "",
    };
    await configStore.load();
    await configStore.setProjectAttachments("proj-1", [attachment]);
    await configStore.setProjectAttachments("proj-1", []);
    const result = await configStore.getProjectAttachments("proj-1");
    expect(result).toEqual([]);
  });

  it("does not affect other project attachments when clearing one", async () => {
    const att: ProjectAttachmentConfig = {
      projectSlug: "org/repo",
      projectName: "Repo",
      localPath: "/path",
      vaultFolder: ".mnemonic",
      enabled: true,
      branch: "main",
      addedAt: "",
      updatedAt: "",
      branchTipHash: "",
    };
    await configStore.load();
    await configStore.setProjectAttachments("proj-1", [att]);
    await configStore.setProjectAttachments("proj-2", [att]);
    await configStore.setProjectAttachments("proj-1", []);
    const result1 = await configStore.getProjectAttachments("proj-1");
    const result2 = await configStore.getProjectAttachments("proj-2");
    expect(result1).toEqual([]);
    expect(result2).toHaveLength(1);
  });
});