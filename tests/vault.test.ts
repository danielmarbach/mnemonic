import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { VaultManager } from "../src/vault.js";
import { Storage, type Note } from "../src/storage.js";
import { GitOps } from "../src/git.js";
import * as fs from "fs/promises";
import * as path from "path";
import os from "os";
import { simpleGit } from "simple-git";

describe("VaultManager", () => {
  let tempDir: string;
  let mainVaultPath: string;
  let vaultManager: VaultManager;
  let originalDisableGit: string | undefined;

  beforeEach(async () => {
    originalDisableGit = process.env.DISABLE_GIT;
    process.env.DISABLE_GIT = "true";
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mnemonic-vault-test-"));
    mainVaultPath = path.join(tempDir, "main-vault");
    await fs.mkdir(mainVaultPath, { recursive: true });
    
    vaultManager = new VaultManager(mainVaultPath);
    await vaultManager.initMain();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    if (originalDisableGit === undefined) {
      delete process.env.DISABLE_GIT;
    } else {
      process.env.DISABLE_GIT = originalDisableGit;
    }
  });

  describe("Main Vault Initialization", () => {
    it("should initialize main vault with correct structure", async () => {
      expect(vaultManager.main).toBeTruthy();
      expect(vaultManager.main.isProject).toBe(false);
      expect(vaultManager.main.notesRelDir).toBe("notes");
      
      // Check directories created
      const notesDir = path.join(mainVaultPath, "notes");
      const embeddingsDir = path.join(mainVaultPath, "embeddings");
      
      const notesExists = await fs.stat(notesDir).then(() => true).catch(() => false);
      const embeddingsExists = await fs.stat(embeddingsDir).then(() => true).catch(() => false);
      
      expect(notesExists).toBe(true);
      expect(embeddingsExists).toBe(true);
    });

    it("should create .gitignore file", async () => {
      const gitignorePath = path.join(mainVaultPath, ".gitignore");
      const content = await fs.readFile(gitignorePath, "utf-8");
      
      expect(content).toContain("embeddings/");
    });
  });

  describe("Project Vault Detection", () => {
    it("should detect project vault when .mnemonic exists", async () => {
      // Create a fake project with git
      const projectDir = path.join(tempDir, "project-a");
      await fs.mkdir(projectDir, { recursive: true });
      
      await initGitRepo(projectDir, "# Project A");
      
      // Should not detect vault yet (no .mnemonic)
      const vaultBefore = await vaultManager.getProjectVaultIfExists(projectDir);
      expect(vaultBefore).toBeNull();
      
      // Create .mnemonic directory
      const mnemonicDir = path.join(projectDir, ".mnemonic");
      await fs.mkdir(mnemonicDir, { recursive: true });
      await fs.writeFile(path.join(mnemonicDir, ".gitignore"), "embeddings/\n");
      
      // Now should detect
      const vaultAfter = await vaultManager.getProjectVaultIfExists(projectDir);
      expect(vaultAfter).toBeTruthy();
      expect(vaultAfter!.isProject).toBe(true);
    });

    it("should create project vault with getOrCreateProjectVault", async () => {
      const projectDir = path.join(tempDir, "project-b");
      await fs.mkdir(projectDir, { recursive: true });
      
      await initGitRepo(projectDir, "# Project B");
      
      // Vault doesn't exist yet
      const existsBefore = await vaultManager.getProjectVaultIfExists(projectDir);
      expect(existsBefore).toBeNull();
      
      // Create it
      const vault = await vaultManager.getOrCreateProjectVault(projectDir);
      expect(vault).toBeTruthy();
      expect(vault!.isProject).toBe(true);
      expect(vault!.notesRelDir).toBe(".mnemonic/notes");
      
      // Should exist now
      const existsAfter = await vaultManager.getProjectVaultIfExists(projectDir);
      expect(existsAfter).toBeTruthy();
      expect(existsAfter!.storage.vaultPath).toBe(vault!.storage.vaultPath);
    });

    it("should not detect main repo as project vault", async () => {
      // Try to get project vault from main vault path
      const vault = await vaultManager.getProjectVaultIfExists(mainVaultPath);
      expect(vault).toBeNull();
    });

    it("should handle non-git directory", async () => {
      const nonGitDir = path.join(tempDir, "no-git");
      await fs.mkdir(nonGitDir, { recursive: true });
      
      const vault = await vaultManager.getProjectVaultIfExists(nonGitDir);
      expect(vault).toBeNull();
    });

    it("should return same vault instance on repeated calls", async () => {
      const projectDir = path.join(tempDir, "project-c");
      await fs.mkdir(projectDir, { recursive: true });
      
      await initGitRepo(projectDir, "# Project C");
      
      const vault1 = await vaultManager.getOrCreateProjectVault(projectDir);
      const vault2 = await vaultManager.getOrCreateProjectVault(projectDir);
      
      expect(vault1).toBe(vault2); // Same instance
    });
  });

  describe("Note Resolution", () => {
    it("should find note in project vault when cwd provided", async () => {
      const projectDir = path.join(tempDir, "project-d");
      await fs.mkdir(projectDir, { recursive: true });
      
      await initGitRepo(projectDir, "# Project D");
      
      const projectVault = await vaultManager.getOrCreateProjectVault(projectDir);
      expect(projectVault).toBeTruthy();
      
      // Write note to project vault
      const note: Note = {
        id: "project-note",
        title: "Project Note",
        content: "Note in project vault",
        tags: [],
        lifecycle: "permanent",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await projectVault!.storage.writeNote(note);
      
      // Find with cwd
      const found = await vaultManager.findNote("project-note", projectDir);
      expect(found).toBeTruthy();
      expect(found!.note.id).toBe("project-note");
      expect(found!.vault.isProject).toBe(true);
    });

    it("should find note in main vault when note not in project", async () => {
      const projectDir = path.join(tempDir, "project-e");
      await fs.mkdir(projectDir, { recursive: true });
      
      await initGitRepo(projectDir, "# Project E");
      
      // Create project vault but don't write note there
      await vaultManager.getOrCreateProjectVault(projectDir);
      
      // Write note to main vault instead
      const note: Note = {
        id: "main-only-note",
        title: "Main Only Note",
        content: "Note only in main vault",
        tags: [],
        lifecycle: "permanent",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await vaultManager.main.storage.writeNote(note);
      
      // Should find in main vault even when searching from project
      const found = await vaultManager.findNote("main-only-note", projectDir);
      expect(found).toBeTruthy();
      expect(found!.note.id).toBe("main-only-note");
      expect(found!.vault.isProject).toBe(false);
    });

    it("should find note without cwd (search all vaults)", async () => {
      // Write note to main
      const mainNote: Note = {
        id: "main-note",
        title: "Main Note",
        content: "In main",
        tags: [],
        lifecycle: "permanent",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await vaultManager.main.storage.writeNote(mainNote);
      
      const found = await vaultManager.findNote("main-note");
      expect(found).toBeTruthy();
      expect(found!.vault.isProject).toBe(false);
    });

    it("should return null for non-existent note", async () => {
      const found = await vaultManager.findNote("non-existent");
      expect(found).toBeNull();
    });

    it("should search project vault first when cwd provided", async () => {
      const projectDir = path.join(tempDir, "project-f");
      await fs.mkdir(projectDir, { recursive: true });
      
      await initGitRepo(projectDir, "# Project F");
      
      const projectVault = await vaultManager.getOrCreateProjectVault(projectDir);
      
      // Write same ID to both vaults
      const note: Note = {
        id: "duplicate-id",
        title: "Duplicate ID",
        content: "Different content",
        tags: [],
        lifecycle: "permanent",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      await projectVault!.storage.writeNote({ ...note, content: "Project version" });
      await vaultManager.main.storage.writeNote({ ...note, content: "Main version" });
      
      // Should find project version first
      const found = await vaultManager.findNote("duplicate-id", projectDir);
      expect(found).toBeTruthy();
      expect(found!.vault.isProject).toBe(true);
      expect(found!.note.content).toBe("Project version");
    });
  });

  describe("All Known Vaults", () => {
    it("should return main vault when no projects loaded", () => {
      const vaults = vaultManager.allKnownVaults();
      expect(vaults).toHaveLength(1);
      expect(vaults[0]).toBe(vaultManager.main);
    });

    it("should return all loaded vaults", async () => {
      // Create multiple projects
      for (let i = 0; i < 3; i++) {
        const projectDir = path.join(tempDir, `project-${i}`);
        await fs.mkdir(projectDir, { recursive: true });
        
        await initGitRepo(projectDir, `# Project ${i}`);
        
        await vaultManager.getOrCreateProjectVault(projectDir);
      }
      
      const vaults = vaultManager.allKnownVaults();
      expect(vaults).toHaveLength(4); // main + 3 projects
      
      const projectVaults = vaults.filter(v => v.isProject);
      expect(projectVaults).toHaveLength(3);
    });
  });

  describe("Note Relative Path", () => {
    it("should build correct path for main vault", () => {
      const relPath = vaultManager.noteRelPath(vaultManager.main, "test-note");
      expect(relPath).toBe("notes/test-note.md");
    });

    it("should build correct path for project vault", async () => {
      const projectDir = path.join(tempDir, "project-g");
      await fs.mkdir(projectDir, { recursive: true });
      
      await initGitRepo(projectDir, "# Project G");
      
      const projectVault = await vaultManager.getOrCreateProjectVault(projectDir);
      const relPath = vaultManager.noteRelPath(projectVault!, "test-note");
      
      expect(relPath).toBe(".mnemonic/notes/test-note.md");
    });
  });

  describe("Search Order", () => {
    it("should return main vault when no cwd", async () => {
      const order = await vaultManager.searchOrder();
      expect(order).toHaveLength(1);
      expect(order[0]).toBe(vaultManager.main);
    });

    it("should return project vault first when cwd provided", async () => {
      const projectDir = path.join(tempDir, "project-h");
      await fs.mkdir(projectDir, { recursive: true });
      
      await initGitRepo(projectDir, "# Project H");
      
      const projectVault = await vaultManager.getOrCreateProjectVault(projectDir);
      const order = await vaultManager.searchOrder(projectDir);
      
      expect(order).toHaveLength(2);
      expect(order[0]).toBe(projectVault);
      expect(order[1]).toBe(vaultManager.main);
    });

    it("should deduplicate vaults in search order", async () => {
      const projectDir = path.join(tempDir, "project-i");
      await fs.mkdir(projectDir, { recursive: true });
      
      await initGitRepo(projectDir, "# Project I");
      
      const projectVault = await vaultManager.getOrCreateProjectVault(projectDir);
      
      // Project vault is already loaded, should not appear twice
      const order = await vaultManager.searchOrder(projectDir);
      
      expect(order).toHaveLength(2);
      const projectCount = order.filter(v => v.isProject).length;
      expect(projectCount).toBe(1);
    });
  });
});

async function initGitRepo(projectDir: string, readmeContent: string): Promise<void> {
  const git = simpleGit(projectDir);
  await git.init();
  await fs.writeFile(path.join(projectDir, "README.md"), readmeContent);
}
