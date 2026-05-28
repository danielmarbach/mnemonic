import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { VaultManager, type ProjectAttachmentConfig } from "../src/vault.js";
import { Storage, type Note, type EmbeddingRecord } from "../src/storage.js";
import { removeStaleEmbeddings } from "../src/helpers/embed.js";
import { memoryId } from "../src/brands.js";
import * as fs from "fs/promises";
import * as path from "path";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import { simpleGit } from "simple-git";

const execFileAsync = promisify(execFile);

async function initGitRepo(dir: string, readmeContent: string): Promise<void> {
  const git = simpleGit(dir);
  await git.init();
  await git.addConfig("user.email", "test@example.com");
  await git.addConfig("user.name", "Test");
  await git.addConfig("init.defaultBranch", "main");
  await execFileAsync("git", ["checkout", "-b", "main"], { cwd: dir }).catch(() => {});
  await fs.writeFile(path.join(dir, "README.md"), readmeContent);
}

async function initGitRepoWithCommit(dir: string, readmeContent: string): Promise<void> {
  await initGitRepo(dir, readmeContent);
  await execFileAsync("git", ["add", "README.md"], { cwd: dir });
  await execFileAsync(
    "git",
    [
      "-c",
      "user.email=test@example.com",
      "-c",
      "user.name=Test",
      "commit",
      "-m",
      "chore: initial commit",
    ],
    { cwd: dir },
  );
}

function makeEmbeddingRecord(id: string): EmbeddingRecord {
  const now = new Date().toISOString();
  return {
    id: memoryId(id),
    model: "nomic-embed-text" as any,
    embedding: [0.1, 0.2, 0.3],
    updatedAt: now as any,
  };
}

describe("VaultManager staleness detection", () => {
  let tempDir: string;
  let mainVaultPath: string;
  let originalDisableGit: string | undefined;

  beforeEach(async () => {
    originalDisableGit = process.env.DISABLE_GIT;
    delete process.env.DISABLE_GIT;
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mnemonic-staleness-test-"));
    mainVaultPath = path.join(tempDir, "main-vault");
    await fs.mkdir(mainVaultPath, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    if (originalDisableGit === undefined) {
      delete process.env.DISABLE_GIT;
    } else {
      process.env.DISABLE_GIT = originalDisableGit;
    }
  });

  async function getHeadHash(repoDir: string): Promise<string> {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repoDir });
    return stdout.trim();
  }

  async function commitChange(
    repoDir: string,
    filePath: string,
    content: string,
    message: string,
  ): Promise<void> {
    await fs.writeFile(path.join(repoDir, filePath), content);
    await execFileAsync("git", ["add", filePath], { cwd: repoDir });
    await execFileAsync(
      "git",
      ["-c", "user.email=test@example.com", "-c", "user.name=Test", "commit", "-m", message],
      { cwd: repoDir },
    );
  }

  function makeAttachmentConfig(
    overrides: Partial<ProjectAttachmentConfig> & { projectSlug: string },
  ): ProjectAttachmentConfig {
    return {
      projectName: overrides.projectSlug,
      localPath: path.join(tempDir, `attached-${overrides.projectSlug}`),
      vaultFolder: ".mnemonic",
      enabled: true,
      branch: "main",
      addedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      branchTipHash: "",
      ...overrides,
    };
  }

  async function setupAttachedVault(localPath: string): Promise<void> {
    await fs.mkdir(localPath, { recursive: true });
    await initGitRepoWithCommit(localPath, "# Attached vault");
    const mnemonicDir = path.join(localPath, ".mnemonic", "notes");
    await fs.mkdir(mnemonicDir, { recursive: true });
  }

  it("updates branchTipHash when config hash differs from current branch tip", async () => {
    const vaultManager = new VaultManager(mainVaultPath);
    await vaultManager.initMain();

    const attachedPath = path.join(tempDir, "attached-stale");
    await setupAttachedVault(attachedPath);

    const currentHash = await getHeadHash(attachedPath);

    const config = makeAttachmentConfig({
      projectSlug: "stale-test",
      localPath: attachedPath,
      branchTipHash: "outdated-hash-that-is-not-current",
    });

    const projectDir = path.join(tempDir, "project-stale");
    await fs.mkdir(projectDir, { recursive: true });
    await initGitRepoWithCommit(projectDir, "# Project Stale");
    await vaultManager.getOrCreateProjectVault(projectDir);

    vaultManager.setAttachmentConfigs("project-stale", [config]);
    const vaults = await vaultManager.loadAttachmentsForProject("project-stale");

    expect(vaults).toHaveLength(1);
    expect(vaults[0]!.attachmentRef).toBeTruthy();
    expect(vaults[0]!.attachmentRef!.branchTipHash).toBe(currentHash);
  });

  it("keeps branchTipHash when config hash matches current branch tip", async () => {
    const vaultManager = new VaultManager(mainVaultPath);
    await vaultManager.initMain();

    const attachedPath = path.join(tempDir, "attached-current");
    await setupAttachedVault(attachedPath);

    const currentHash = await getHeadHash(attachedPath);

    const config = makeAttachmentConfig({
      projectSlug: "current-test",
      localPath: attachedPath,
      branchTipHash: currentHash,
    });

    const projectDir = path.join(tempDir, "project-current");
    await fs.mkdir(projectDir, { recursive: true });
    await initGitRepoWithCommit(projectDir, "# Project Current");
    await vaultManager.getOrCreateProjectVault(projectDir);

    vaultManager.setAttachmentConfigs("project-current", [config]);
    const vaults = await vaultManager.loadAttachmentsForProject("project-current");

    expect(vaults).toHaveLength(1);
    expect(vaults[0]!.attachmentRef!.branchTipHash).toBe(currentHash);
  });

  it("does not check branch tip when branch is empty string (working-tree mode)", async () => {
    const vaultManager = new VaultManager(mainVaultPath);
    await vaultManager.initMain();

    const attachedPath = path.join(tempDir, "attached-working-tree");
    await setupAttachedVault(attachedPath);

    const config = makeAttachmentConfig({
      projectSlug: "working-tree-test",
      localPath: attachedPath,
      branch: "",
      branchTipHash: "should-not-change",
    });

    const projectDir = path.join(tempDir, "project-wt");
    await fs.mkdir(projectDir, { recursive: true });
    await initGitRepoWithCommit(projectDir, "# Project WT");
    await vaultManager.getOrCreateProjectVault(projectDir);

    vaultManager.setAttachmentConfigs("project-wt", [config]);
    const vaults = await vaultManager.loadAttachmentsForProject("project-wt");

    expect(vaults).toHaveLength(1);
    expect(vaults[0]!.attachmentRef!.branch).toBe("");
    expect(vaults[0]!.attachmentRef!.branchTipHash).toBe("should-not-change");
  });

  it("updates branchTipHash after a new commit on the attached repo", async () => {
    const vaultManager = new VaultManager(mainVaultPath);
    await vaultManager.initMain();

    const attachedPath = path.join(tempDir, "attached-evolving");
    await setupAttachedVault(attachedPath);

    const initialHash = await getHeadHash(attachedPath);

    const config = makeAttachmentConfig({
      projectSlug: "evolving-test",
      localPath: attachedPath,
      branchTipHash: initialHash,
    });

    const projectDir = path.join(tempDir, "project-evolving");
    await fs.mkdir(projectDir, { recursive: true });
    await initGitRepoWithCommit(projectDir, "# Project Evolving");
    await vaultManager.getOrCreateProjectVault(projectDir);

    vaultManager.setAttachmentConfigs("project-evolving", [config]);
    const vaultsFirst = await vaultManager.loadAttachmentsForProject("project-evolving");
    expect(vaultsFirst[0]!.attachmentRef!.branchTipHash).toBe(initialHash);

    await commitChange(attachedPath, "new-file.txt", "new content", "chore: new commit");
    const updatedHash = await getHeadHash(attachedPath);
    expect(updatedHash).not.toBe(initialHash);

    vaultManager.clearAttachmentCaches();
    const updatedConfig = makeAttachmentConfig({
      projectSlug: "evolving-test",
      localPath: attachedPath,
      branchTipHash: initialHash,
    });
    vaultManager.setAttachmentConfigs("project-evolving", [updatedConfig]);
    const vaultsSecond = await vaultManager.loadAttachmentsForProject("project-evolving");
    expect(vaultsSecond[0]!.attachmentRef!.branchTipHash).toBe(updatedHash);
  });
});

describe("removeStaleEmbeddings", () => {
  let tempDir: string;
  let storage: Storage;
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
    );
  });

  async function createTempStorage(): Promise<Storage> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mnemonic-staleness-embed-"));
    tempDirs.push(dir);
    const s = new Storage(dir);
    await s.init();
    return s;
  }

  it("removes embedding files for note IDs that no longer exist", async () => {
    storage = await createTempStorage();

    const staleId = memoryId("stale-note");
    const activeId = memoryId("active-note");

    await storage.writeEmbedding(makeEmbeddingRecord("stale-note"));
    await storage.writeEmbedding(makeEmbeddingRecord("active-note"));

    const note: Note = {
      id: activeId,
      title: "Active Note",
      content: "Still here",
      tags: [],
      lifecycle: "permanent",
      createdAt: new Date().toISOString() as any,
      updatedAt: new Date().toISOString() as any,
    };
    await storage.writeNote(note);

    expect(await storage.readEmbedding(staleId)).not.toBeNull();
    expect(await storage.readEmbedding(activeId)).not.toBeNull();

    await removeStaleEmbeddings(storage, ["stale-note"]);

    expect(await storage.readEmbedding(staleId)).toBeNull();
    expect(await storage.readEmbedding(activeId)).not.toBeNull();
  });

  it("preserves all embeddings when all note IDs still exist", async () => {
    storage = await createTempStorage();

    await storage.writeEmbedding(makeEmbeddingRecord("note-a"));
    await storage.writeEmbedding(makeEmbeddingRecord("note-b"));

    const noteA: Note = {
      id: memoryId("note-a"),
      title: "Note A",
      content: "Content A",
      tags: [],
      lifecycle: "permanent",
      createdAt: new Date().toISOString() as any,
      updatedAt: new Date().toISOString() as any,
    };
    const noteB: Note = {
      id: memoryId("note-b"),
      title: "Note B",
      content: "Content B",
      tags: [],
      lifecycle: "permanent",
      createdAt: new Date().toISOString() as any,
      updatedAt: new Date().toISOString() as any,
    };
    await storage.writeNote(noteA);
    await storage.writeNote(noteB);

    await removeStaleEmbeddings(storage, []);

    expect(await storage.readEmbedding(memoryId("note-a"))).not.toBeNull();
    expect(await storage.readEmbedding(memoryId("note-b"))).not.toBeNull();
  });

  it("removes multiple stale embeddings", async () => {
    storage = await createTempStorage();

    await storage.writeEmbedding(makeEmbeddingRecord("stale-1"));
    await storage.writeEmbedding(makeEmbeddingRecord("stale-2"));
    await storage.writeEmbedding(makeEmbeddingRecord("active-1"));

    const note: Note = {
      id: memoryId("active-1"),
      title: "Active 1",
      content: "Still here",
      tags: [],
      lifecycle: "permanent",
      createdAt: new Date().toISOString() as any,
      updatedAt: new Date().toISOString() as any,
    };
    await storage.writeNote(note);

    await removeStaleEmbeddings(storage, ["stale-1", "stale-2"]);

    expect(await storage.readEmbedding(memoryId("stale-1"))).toBeNull();
    expect(await storage.readEmbedding(memoryId("stale-2"))).toBeNull();
    expect(await storage.readEmbedding(memoryId("active-1"))).not.toBeNull();
  });

  it("does not throw when removing embeddings that do not exist on disk", async () => {
    storage = await createTempStorage();

    await expect(removeStaleEmbeddings(storage, ["never-existed"])).resolves.toBeUndefined();
  });
});

describe("VaultManager clearAttachmentCaches and reload", () => {
  let tempDir: string;
  let mainVaultPath: string;
  let originalDisableGit: string | undefined;

  beforeEach(async () => {
    originalDisableGit = process.env.DISABLE_GIT;
    delete process.env.DISABLE_GIT;
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mnemonic-staleness-reload-"));
    mainVaultPath = path.join(tempDir, "main-vault");
    await fs.mkdir(mainVaultPath, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    if (originalDisableGit === undefined) {
      delete process.env.DISABLE_GIT;
    } else {
      process.env.DISABLE_GIT = originalDisableGit;
    }
  });

  async function getHeadHash(repoDir: string): Promise<string> {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repoDir });
    return stdout.trim();
  }

  function makeAttachmentConfig(
    overrides: Partial<ProjectAttachmentConfig> & { projectSlug: string },
  ): ProjectAttachmentConfig {
    return {
      projectName: overrides.projectSlug,
      localPath: path.join(tempDir, `attached-${overrides.projectSlug}`),
      vaultFolder: ".mnemonic",
      enabled: true,
      branch: "main",
      addedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      branchTipHash: "",
      ...overrides,
    };
  }

  async function setupAttachedVault(localPath: string): Promise<void> {
    await fs.mkdir(localPath, { recursive: true });
    await initGitRepoWithCommit(localPath, "# Attached vault");
    const mnemonicDir = path.join(localPath, ".mnemonic", "notes");
    await fs.mkdir(mnemonicDir, { recursive: true });
  }

  it("reloads fresh attachments after clearAttachmentCaches", async () => {
    const vaultManager = new VaultManager(mainVaultPath);
    await vaultManager.initMain();

    const attachedPath = path.join(tempDir, "attached-reload");
    await setupAttachedVault(attachedPath);

    const projectDir = path.join(tempDir, "project-reload");
    await fs.mkdir(projectDir, { recursive: true });
    await initGitRepoWithCommit(projectDir, "# Project Reload");
    await vaultManager.getOrCreateProjectVault(projectDir);

    const initialHash = await getHeadHash(attachedPath);

    const config = makeAttachmentConfig({
      projectSlug: "reload-test",
      localPath: attachedPath,
      branchTipHash: initialHash,
    });

    vaultManager.setAttachmentConfigs("project-reload", [config]);
    const firstLoad = await vaultManager.loadAttachmentsForProject("project-reload");
    expect(firstLoad).toHaveLength(1);
    expect(firstLoad[0]!.attachmentRef!.branchTipHash).toBe(initialHash);

    vaultManager.clearAttachmentCaches();
    expect(vaultManager.getAttachmentsForProject("project-reload")).toHaveLength(0);

    const updatedConfig = makeAttachmentConfig({
      projectSlug: "reload-test",
      localPath: attachedPath,
      branchTipHash: initialHash,
    });
    vaultManager.setAttachmentConfigs("project-reload", [updatedConfig]);
    const secondLoad = await vaultManager.loadAttachmentsForProject("project-reload");
    expect(secondLoad).toHaveLength(1);
    expect(secondLoad[0]!.attachmentRef!.branchTipHash).toBe(initialHash);

    expect(secondLoad[0]).not.toBe(firstLoad[0]);
  });

  it("clearAttachmentCaches clears both vault and config caches", async () => {
    const vaultManager = new VaultManager(mainVaultPath);
    await vaultManager.initMain();

    const attachedPath = path.join(tempDir, "attached-clear");
    await setupAttachedVault(attachedPath);

    const projectDir = path.join(tempDir, "project-clear");
    await fs.mkdir(projectDir, { recursive: true });
    await initGitRepoWithCommit(projectDir, "# Project Clear");
    await vaultManager.getOrCreateProjectVault(projectDir);

    const config = makeAttachmentConfig({
      projectSlug: "clear-test",
      localPath: attachedPath,
    });

    vaultManager.setAttachmentConfigs("project-clear", [config]);
    await vaultManager.loadAttachmentsForProject("project-clear");
    expect(vaultManager.getAttachmentsForProject("project-clear")).toHaveLength(1);

    vaultManager.clearAttachmentCaches();

    expect(vaultManager.getAttachmentsForProject("project-clear")).toHaveLength(0);
  });
});
