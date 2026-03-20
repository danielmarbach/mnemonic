import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { VaultManager } from "../src/vault.js";
import { Storage, type Note } from "../src/storage.js";
import { GitOps } from "../src/git.js";
import * as fs from "fs/promises";
import * as path from "path";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import { simpleGit } from "simple-git";

const execFileAsync = promisify(execFile);

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

    it("should not create or commit gitignore when loading existing project vault (getProjectVaultIfExists)", async () => {
      const projectDir = path.join(tempDir, "project-gitignore-bug");
      await fs.mkdir(projectDir, { recursive: true });
      await initGitRepo(projectDir, "# Project Gitignore Bug");
      
      const mnemonicDir = path.join(projectDir, ".mnemonic");
      await fs.mkdir(mnemonicDir, { recursive: true });
      await fs.mkdir(path.join(mnemonicDir, "notes"), { recursive: true });
      await fs.mkdir(path.join(mnemonicDir, "embeddings"), { recursive: true });
      
      // NO .gitignore file created initially
      
      // Load the existing project vault (create: false)
      const vault = await vaultManager.getProjectVaultIfExists(projectDir);
      expect(vault).toBeTruthy();
      
      // Bug fix verification: gitignore should NOT be created when just loading an existing vault
      const gitignorePath = path.join(mnemonicDir, ".gitignore");
      const gitignoreExists = await fs.stat(gitignorePath).then(() => true).catch(() => false);
      expect(gitignoreExists).toBe(false);
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

  describe("Git Submodule Support", () => {
    it("should anchor project vault in the superproject when cwd is inside a submodule", async () => {
      // Set up a parent repo with a nested submodule
      const parentDir = path.join(tempDir, "parent-repo");
      const submoduleDir = path.join(tempDir, "submodule-repo");

      // Create the submodule repo first (as a standalone repo)
      await fs.mkdir(submoduleDir, { recursive: true });
      await initGitRepoWithCommit(submoduleDir, "# Submodule");

      // Create the parent repo and add the submodule
      await fs.mkdir(parentDir, { recursive: true });
      await initGitRepoWithCommit(parentDir, "# Parent");
      await addSubmodule(parentDir, submoduleDir, "vendor/submodule");

      const submoduleCwd = path.join(parentDir, "vendor/submodule");

      // getOrCreateProjectVault from inside the submodule should place .mnemonic in the parent
      const vault = await vaultManager.getOrCreateProjectVault(submoduleCwd);
      expect(vault).toBeTruthy();
      expect(vault!.isProject).toBe(true);
      // The vault storage path must be inside the parent repo, not the submodule
      expect(vault!.storage.vaultPath).toContain(parentDir);
      expect(vault!.storage.vaultPath).not.toContain("vendor/submodule");
    });

    it("should return the same project vault whether cwd is in the superproject or its submodule", async () => {
      const parentDir = path.join(tempDir, "parent-repo-2");
      const submoduleDir = path.join(tempDir, "submodule-repo-2");

      await fs.mkdir(submoduleDir, { recursive: true });
      await initGitRepoWithCommit(submoduleDir, "# Submodule 2");

      await fs.mkdir(parentDir, { recursive: true });
      await initGitRepoWithCommit(parentDir, "# Parent 2");
      await addSubmodule(parentDir, submoduleDir, "vendor/lib");

      const submoduleCwd = path.join(parentDir, "vendor/lib");

      const vaultFromParent = await vaultManager.getOrCreateProjectVault(parentDir);
      const vaultFromSubmodule = await vaultManager.getOrCreateProjectVault(submoduleCwd);

      expect(vaultFromParent).toBeTruthy();
      expect(vaultFromSubmodule).toBeTruthy();
      // Both must resolve to the same vault instance (same superproject git root)
      expect(vaultFromParent!.storage.vaultPath).toBe(vaultFromSubmodule!.storage.vaultPath);
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

  describe("Multi-Vault (Submodule Vault) Support", () => {
    it("should discover .mnemonic-* folders alongside primary project vault", async () => {
      const projectDir = path.join(tempDir, "project-multi");
      await fs.mkdir(projectDir, { recursive: true });
      await initGitRepo(projectDir, "# Multi-Vault Project");

      // Create primary vault and a submodule vault folder
      await fs.mkdir(path.join(projectDir, ".mnemonic", "notes"), { recursive: true });
      await fs.mkdir(path.join(projectDir, ".mnemonic-sub1", "notes"), { recursive: true });
      await fs.mkdir(path.join(projectDir, ".mnemonic-sub2", "notes"), { recursive: true });

      const primaryVault = await vaultManager.getOrCreateProjectVault(projectDir);
      expect(primaryVault).toBeTruthy();
      expect(primaryVault!.vaultFolderName).toBe(".mnemonic");

      // allKnownVaults should include main + primary + both submodule vaults
      const allVaults = vaultManager.allKnownVaults();
      const projectVaults = allVaults.filter(v => v.isProject);
      expect(projectVaults).toHaveLength(3); // primary + sub1 + sub2

      const folderNames = projectVaults.map(v => v.vaultFolderName).sort();
      expect(folderNames).toEqual([".mnemonic", ".mnemonic-sub1", ".mnemonic-sub2"]);
    });

    it("should not load non-existent .mnemonic-* folders", async () => {
      const projectDir = path.join(tempDir, "project-no-subvaults");
      await fs.mkdir(projectDir, { recursive: true });
      await initGitRepo(projectDir, "# No Subvaults");

      // Only the primary vault folder exists
      await fs.mkdir(path.join(projectDir, ".mnemonic", "notes"), { recursive: true });

      const primaryVault = await vaultManager.getOrCreateProjectVault(projectDir);
      expect(primaryVault).toBeTruthy();

      const allVaults = vaultManager.allKnownVaults();
      const projectVaults = allVaults.filter(v => v.isProject);
      expect(projectVaults).toHaveLength(1);
      expect(projectVaults[0]!.vaultFolderName).toBe(".mnemonic");
    });

    it("should return submodule vault via getVaultByFolder", async () => {
      const projectDir = path.join(tempDir, "project-by-folder");
      await fs.mkdir(projectDir, { recursive: true });
      await initGitRepo(projectDir, "# By Folder");

      await fs.mkdir(path.join(projectDir, ".mnemonic", "notes"), { recursive: true });
      await fs.mkdir(path.join(projectDir, ".mnemonic-lib", "notes"), { recursive: true });

      // Load vaults
      await vaultManager.getOrCreateProjectVault(projectDir);

      const libVault = await vaultManager.getVaultByFolder(projectDir, ".mnemonic-lib");
      expect(libVault).toBeTruthy();
      expect(libVault!.vaultFolderName).toBe(".mnemonic-lib");
      expect(libVault!.isProject).toBe(true);
      expect(libVault!.notesRelDir).toBe(".mnemonic-lib/notes");
    });

    it("should return null for unknown vault folder", async () => {
      const projectDir = path.join(tempDir, "project-unknown-folder");
      await fs.mkdir(projectDir, { recursive: true });
      await initGitRepo(projectDir, "# Unknown Folder");

      await fs.mkdir(path.join(projectDir, ".mnemonic", "notes"), { recursive: true });
      await vaultManager.getOrCreateProjectVault(projectDir);

      const result = await vaultManager.getVaultByFolder(projectDir, ".mnemonic-nonexistent");
      expect(result).toBeNull();
    });

    it("should share embeddings directory between primary and submodule vaults", async () => {
      const projectDir = path.join(tempDir, "project-shared-embeddings");
      await fs.mkdir(projectDir, { recursive: true });
      await initGitRepo(projectDir, "# Shared Embeddings");

      await fs.mkdir(path.join(projectDir, ".mnemonic", "notes"), { recursive: true });
      await fs.mkdir(path.join(projectDir, ".mnemonic-sub", "notes"), { recursive: true });

      const primaryVault = await vaultManager.getOrCreateProjectVault(projectDir);
      const subVault = await vaultManager.getVaultByFolder(projectDir, ".mnemonic-sub");

      expect(primaryVault).toBeTruthy();
      expect(subVault).toBeTruthy();

      // Submodule vault embeddings dir should point to primary vault's embeddings dir
      expect(subVault!.storage.embeddingsDir).toBe(primaryVault!.storage.embeddingsDir);
      // Both should be inside the primary vault path
      expect(primaryVault!.storage.embeddingsDir).toContain(".mnemonic");
      expect(primaryVault!.storage.embeddingsDir).not.toContain(".mnemonic-sub");
    });

    it("should include submodule vaults in searchOrder", async () => {
      const projectDir = path.join(tempDir, "project-search-order");
      await fs.mkdir(projectDir, { recursive: true });
      await initGitRepo(projectDir, "# Search Order");

      await fs.mkdir(path.join(projectDir, ".mnemonic", "notes"), { recursive: true });
      await fs.mkdir(path.join(projectDir, ".mnemonic-alpha", "notes"), { recursive: true });

      await vaultManager.getOrCreateProjectVault(projectDir);

      const order = await vaultManager.searchOrder(projectDir);

      // Should have: primary project vault, submodule vault, main vault
      expect(order.length).toBeGreaterThanOrEqual(3);
      const projectVaultsInOrder = order.filter(v => v.isProject);
      expect(projectVaultsInOrder).toHaveLength(2);

      // Primary project vault should come first
      expect(order[0]!.vaultFolderName).toBe(".mnemonic");
      // Submodule vault second
      expect(order[1]!.vaultFolderName).toBe(".mnemonic-alpha");
      // Main vault last
      expect(order[order.length - 1]).toBe(vaultManager.main);
    });

    it("should find notes in submodule vaults via findNote", async () => {
      const projectDir = path.join(tempDir, "project-find-sub");
      await fs.mkdir(projectDir, { recursive: true });
      await initGitRepo(projectDir, "# Find In Sub");

      await fs.mkdir(path.join(projectDir, ".mnemonic", "notes"), { recursive: true });
      await fs.mkdir(path.join(projectDir, ".mnemonic-sub", "notes"), { recursive: true });

      await vaultManager.getOrCreateProjectVault(projectDir);
      const subVault = await vaultManager.getVaultByFolder(projectDir, ".mnemonic-sub");
      expect(subVault).toBeTruthy();

      const note: Note = {
        id: "sub-note-abc",
        title: "Sub Note",
        content: "Note in submodule vault",
        tags: [],
        lifecycle: "permanent",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await subVault!.storage.writeNote(note);

      const found = await vaultManager.findNote("sub-note-abc", projectDir);
      expect(found).toBeTruthy();
      expect(found!.note.id).toBe("sub-note-abc");
      expect(found!.vault.vaultFolderName).toBe(".mnemonic-sub");
    });

    it("should assign correct vaultFolderName to main vault", () => {
      expect(vaultManager.main.vaultFolderName).toBe("");
    });

    it("should assign correct notesRelDir for submodule vault", async () => {
      const projectDir = path.join(tempDir, "project-notes-rel");
      await fs.mkdir(projectDir, { recursive: true });
      await initGitRepo(projectDir, "# Notes Rel Dir");

      await fs.mkdir(path.join(projectDir, ".mnemonic", "notes"), { recursive: true });
      await fs.mkdir(path.join(projectDir, ".mnemonic-widget", "notes"), { recursive: true });

      await vaultManager.getOrCreateProjectVault(projectDir);
      const widgetVault = await vaultManager.getVaultByFolder(projectDir, ".mnemonic-widget");
      expect(widgetVault).toBeTruthy();

      const relPath = vaultManager.noteRelPath(widgetVault!, "my-note");
      expect(relPath).toBe(".mnemonic-widget/notes/my-note.md");
    });
  });

  describe("getPendingNoteFiles", () => {
    it("returns pending files for staged notes", async () => {
      delete process.env.DISABLE_GIT;
      const projectDir = path.join(tempDir, "project-pending");
      await fs.mkdir(projectDir, { recursive: true });
      await initGitRepo(projectDir, "# Pending Test");

      const vaultMgr = new VaultManager(mainVaultPath);
      await vaultMgr.initMain();
      const projectVault = await vaultMgr.getOrCreateProjectVault(projectDir);
      expect(projectVault).toBeTruthy();

      // Write a note
      const note: Note = {
        id: "test-note",
        title: "Test Note",
        content: "Test content",
        tags: [],
        lifecycle: "permanent",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await projectVault!.storage.writeNote(note);

      // Stage the file manually
      const git = simpleGit(projectDir);
      await git.add(".mnemonic/notes/test-note.md");

      // Check for pending files
      const pendingFiles = await vaultMgr.getPendingNoteFiles(projectVault!, ["test-note"]);
      expect(pendingFiles).toContain(".mnemonic/notes/test-note.md");
      
      process.env.DISABLE_GIT = "true";
    });

    it("returns pending files for modified notes", async () => {
      delete process.env.DISABLE_GIT;
      const projectDir = path.join(tempDir, "project-pending-mod");
      await fs.mkdir(projectDir, { recursive: true });
      await initGitRepoWithCommit(projectDir, "# Pending Mod Test");

      const vaultMgr = new VaultManager(mainVaultPath);
      await vaultMgr.initMain();
      const projectVault = await vaultMgr.getOrCreateProjectVault(projectDir);
      expect(projectVault).toBeTruthy();

      // Write and commit a note first
      const note: Note = {
        id: "test-note-mod",
        title: "Test Note",
        content: "Original content",
        tags: [],
        lifecycle: "permanent",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await projectVault!.storage.writeNote(note);
      const git = simpleGit(projectDir);
      await git.add(".mnemonic/notes/test-note-mod.md");
      await git.commit("initial note");

      // Modify the note (creates modified file)
      await projectVault!.storage.writeNote({ ...note, content: "Modified content" });

      // Check for pending files - should pick up modified file
      const pendingFiles = await vaultMgr.getPendingNoteFiles(projectVault!, ["test-note-mod"]);
      expect(pendingFiles).toContain(".mnemonic/notes/test-note-mod.md");
      
      process.env.DISABLE_GIT = "true";
    });

    it("returns empty array when git is disabled", async () => {
      // Git is already disabled in beforeEach
      // The status() method returns empty arrays when DISABLE_GIT=true
      const pendingFiles = await vaultManager.getPendingNoteFiles(vaultManager.main, ["any-note"]);
      expect(pendingFiles).toEqual([]);
    });

    it("returns empty array when no pending changes", async () => {
      delete process.env.DISABLE_GIT;
      const projectDir = path.join(tempDir, "project-clean");
      await fs.mkdir(projectDir, { recursive: true });
      await initGitRepo(projectDir, "# Clean Test");

      const vaultMgr = new VaultManager(mainVaultPath);
      await vaultMgr.initMain();
      const projectVault = await vaultMgr.getOrCreateProjectVault(projectDir);
      expect(projectVault).toBeTruthy();

      const pendingFiles = await vaultMgr.getPendingNoteFiles(projectVault!, ["nonexistent"]);
      expect(pendingFiles).toEqual([]);
      
      process.env.DISABLE_GIT = "true";
    });

    it("returns multiple pending files", async () => {
      delete process.env.DISABLE_GIT;
      const projectDir = path.join(tempDir, "project-multi-pending");
      await fs.mkdir(projectDir, { recursive: true });
      await initGitRepo(projectDir, "# Multi Pending");

      const vaultMgr = new VaultManager(mainVaultPath);
      await vaultMgr.initMain();
      const projectVault = await vaultMgr.getOrCreateProjectVault(projectDir);
      expect(projectVault).toBeTruthy();

      // Write multiple notes and stage them
      for (let i = 1; i <= 2; i++) {
        const note: Note = {
          id: `note-${i}`,
          title: `Note ${i}`,
          content: `Content ${i}`,
          tags: [],
          lifecycle: "permanent",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await projectVault!.storage.writeNote(note);
      }

      const git = simpleGit(projectDir);
      await git.add(".mnemonic/notes/note-1.md");
      await git.add(".mnemonic/notes/note-2.md");

      const pendingFiles = await vaultMgr.getPendingNoteFiles(projectVault!, ["note-1", "note-2"]);
      expect(pendingFiles).toHaveLength(2);
      expect(pendingFiles).toContain(".mnemonic/notes/note-1.md");
      expect(pendingFiles).toContain(".mnemonic/notes/note-2.md");
      
      process.env.DISABLE_GIT = "true";
    });
  });
});

async function initGitRepo(projectDir: string, readmeContent: string): Promise<void> {
  const git = simpleGit(projectDir);
  await git.init();
  await git.addConfig("user.email", "test@example.com");
  await git.addConfig("user.name", "Test");
  await fs.writeFile(path.join(projectDir, "README.md"), readmeContent);
}

async function initGitRepoWithCommit(projectDir: string, readmeContent: string): Promise<void> {
  await initGitRepo(projectDir, readmeContent);
  await execFileAsync("git", ["add", "README.md"], { cwd: projectDir });
  await execFileAsync("git", ["-c", "user.email=test@example.com", "-c", "user.name=Test", "commit", "-m", "chore: initial commit"], { cwd: projectDir });
}

async function addSubmodule(parentDir: string, submoduleDir: string, submodulePath: string): Promise<void> {
  await execFileAsync("git", ["-c", "protocol.file.allow=always", "-c", "user.email=test@example.com", "-c", "user.name=Test", "submodule", "add", submoduleDir, submodulePath], { cwd: parentDir });
  await execFileAsync("git", ["-c", "user.email=test@example.com", "-c", "user.name=Test", "commit", "-m", "chore: add submodule", ".gitmodules", submodulePath], { cwd: parentDir });
}
