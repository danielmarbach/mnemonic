import fs from "fs/promises";
import path from "path";
import { simpleGit } from "simple-git";

import { Storage, type Note } from "./storage.js";
import { GitOps } from "./git.js";

// ── Public types ──────────────────────────────────────────────────────────────

export interface Vault {
  storage: Storage;
  git: GitOps;
  /**
   * Notes directory path relative to the vault's git root.
   * "notes" for the main vault, ".mnemonic/notes" for project vaults.
   */
  notesRelDir: string;
  /** True when this vault lives inside a project repo (.mnemonic/). */
  isProject: boolean;
  /**
   * Vault folder name relative to the git root.
   * - "" for the main vault (it is its own standalone git repo).
   * - ".mnemonic" for the primary project vault.
   * - ".mnemonic-<name>" for submodule-specific project vaults.
   */
  vaultFolderName: string;
}

// ── VaultManager ─────────────────────────────────────────────────────────────

export class VaultManager {
  readonly main: Vault;
  /**
   * Primary project vaults (`.mnemonic/`) loaded this session, keyed by resolved git root.
   * Used for backwards-compatible single-vault access.
   */
  private primaryProjectVaults = new Map<string, Vault>();
  /**
   * All project vaults per git root (primary + submodule vaults), keyed by resolved git root.
   * The first entry in the array is always the primary `.mnemonic` vault.
   */
  private allProjectVaultsByRoot = new Map<string, Vault[]>();
  /** Git root of the main vault — set after initMain(). */
  private mainGitRoot = "";

  constructor(mainVaultPath: string) {
    const resolved = path.resolve(mainVaultPath);
    this.main = makeVault(resolved, resolved, "notes", false, "");
  }

  async initMain(): Promise<void> {
    await this.main.storage.init();
    await this.main.git.init();
    await ensureGitignore(path.join(this.main.storage.vaultPath, ".gitignore"));
    this.mainGitRoot = (await findGitRoot(this.main.storage.vaultPath)) ?? this.main.storage.vaultPath;
  }

  /**
   * Get or create the primary project vault for the given cwd.
   * Creates <git-root>/.mnemonic/ if it does not exist yet.
   * Also discovers and loads any existing `.mnemonic-*` submodule vaults at the same root.
   * Returns null when cwd is not inside a git repo or belongs to the main vault's repo.
   */
  async getOrCreateProjectVault(cwd: string): Promise<Vault | null> {
    const gitRoot = await findGitRoot(cwd);
    if (!gitRoot || this.isMainRepo(gitRoot)) return null;
    return this.loadAllVaultsForRoot(gitRoot, true);
  }

  /**
   * Return the primary project vault only if .mnemonic/ already exists — never creates.
   * Also discovers and loads any existing `.mnemonic-*` submodule vaults at the same root.
   * Returns null when the vault does not exist yet.
   */
  async getProjectVaultIfExists(cwd: string): Promise<Vault | null> {
    const gitRoot = await findGitRoot(cwd);
    if (!gitRoot || this.isMainRepo(gitRoot)) return null;
    return this.loadAllVaultsForRoot(gitRoot, false);
  }

  /**
   * Return a specific project vault by its vault folder name (e.g. ".mnemonic-submodule1")
   * within the git root for the given cwd.
   * Returns null when the vault folder does not exist or cwd is not in a git repo.
   */
  async getVaultByFolder(cwd: string, folderName: string): Promise<Vault | null> {
    const gitRoot = await findGitRoot(cwd);
    if (!gitRoot || this.isMainRepo(gitRoot)) return null;
    const resolved = path.resolve(gitRoot);

    // Ensure vaults are loaded for this root (don't create the primary vault)
    if (!this.allProjectVaultsByRoot.has(resolved)) {
      await this.loadAllVaultsForRoot(gitRoot, false);
    }

    return this.allProjectVaultsByRoot.get(resolved)?.find(v => v.vaultFolderName === folderName) ?? null;
  }

  /**
   * Find a note by id, checking the project vault first (when cwd is given)
   * then falling back through all other known vaults and finally the main vault.
   */
  async findNote(id: string, cwd?: string): Promise<{ note: Note; vault: Vault } | null> {
    for (const vault of await this.searchOrder(cwd)) {
      const note = await vault.storage.readNote(id);
      if (note) return { note, vault };
    }
    return null;
  }

  /** All vaults currently loaded in this session (main + all project vaults including submodule). */
  allKnownVaults(): Vault[] {
    const all: Vault[] = [this.main];
    for (const vaults of this.allProjectVaultsByRoot.values()) {
      all.push(...vaults);
    }
    return all;
  }

  /**
   * Ordered list of vaults for recall / list operations.
   * All project vaults for the cwd's git root come first (primary, then submodule),
   * followed by the main vault.
   */
  async searchOrder(cwd?: string): Promise<Vault[]> {
    const vaults: Vault[] = [];
    if (cwd) {
      const pv = await this.getProjectVaultIfExists(cwd);
      if (pv) {
        const gitRoot = await findGitRoot(cwd);
        if (gitRoot) {
          const resolved = path.resolve(gitRoot);
          const all = this.allProjectVaultsByRoot.get(resolved);
          if (all) {
            vaults.push(...all);
          } else {
            vaults.push(pv);
          }
        } else {
          vaults.push(pv);
        }
      }
    }
    vaults.push(this.main);
    return vaults;
  }

  /** Build the file path for a note relative to the vault's git root. */
  noteRelPath(vault: Vault, noteId: string): string {
    return `${vault.notesRelDir}/${noteId}.md`;
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private isMainRepo(gitRoot: string): boolean {
    return path.resolve(gitRoot) === path.resolve(this.mainGitRoot);
  }

  /**
   * Load the primary project vault and discover any submodule vaults at the same git root.
   * Submodule vaults use the primary vault's embeddings directory so that all embeddings
   * for a project live in one place (.mnemonic/embeddings/).
   */
  private async loadAllVaultsForRoot(gitRoot: string, create: boolean): Promise<Vault | null> {
    const resolved = path.resolve(gitRoot);

    if (this.primaryProjectVaults.has(resolved)) {
      return this.primaryProjectVaults.get(resolved)!;
    }

    const mnemonicPath = path.join(resolved, ".mnemonic");

    if (!create && !(await pathExists(mnemonicPath))) return null;

    const primaryVault = makeVault(mnemonicPath, resolved, ".mnemonic/notes", true, ".mnemonic");
    await primaryVault.storage.init();
    await primaryVault.git.init();

    const gitignorePath = path.join(mnemonicPath, ".gitignore");
    const isNew = !(await pathExists(gitignorePath));
    await ensureGitignore(gitignorePath);

    if (isNew) {
      // Commit the .gitignore so collaborators also ignore embeddings/
      await primaryVault.git.commit("chore: initialize .mnemonic vault", [".mnemonic/.gitignore"]);
    }

    this.primaryProjectVaults.set(resolved, primaryVault);

    // Discover and load submodule vaults (.mnemonic-* directories at the git root).
    // Submodule vault embeddings are stored in the primary vault's embeddings directory
    // so all embeddings for the project stay in one place.
    const allVaults: Vault[] = [primaryVault];
    const submoduleFolderNames = await discoverSubmoduleVaultFolders(resolved);
    for (const folderName of submoduleFolderNames) {
      const subVaultPath = path.join(resolved, folderName);
      if (!(await pathExists(subVaultPath))) continue;
      const notesRelDir = `${folderName}/notes`;
      const subVault = makeVault(
        subVaultPath,
        resolved,
        notesRelDir,
        true,
        folderName,
        primaryVault.storage.embeddingsDir,
      );
      await subVault.storage.init();
      await subVault.git.init();
      allVaults.push(subVault);
    }

    this.allProjectVaultsByRoot.set(resolved, allVaults);
    return primaryVault;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeVault(
  vaultPath: string,
  gitRoot: string,
  notesRelDir: string,
  isProject: boolean,
  vaultFolderName: string,
  embeddingsDirOverride?: string,
): Vault {
  return {
    storage: new Storage(vaultPath, embeddingsDirOverride),
    git: new GitOps(gitRoot, notesRelDir),
    notesRelDir,
    isProject,
    vaultFolderName,
  };
}

/**
 * Discover submodule vault folder names (`.mnemonic-*`) at the git root.
 * These are siblings of the primary `.mnemonic` vault and provide separate note
 * namespaces for submodule-specific context while sharing the same git history.
 */
async function discoverSubmoduleVaultFolders(gitRoot: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(gitRoot, { withFileTypes: true });
    return entries
      .filter(e => e.isDirectory() && e.name.startsWith(".mnemonic-"))
      .map(e => e.name)
      .sort();
  } catch {
    return [];
  }
}

async function findGitRoot(cwd: string, visited: Set<string> = new Set()): Promise<string | null> {
  try {
    const git = simpleGit(cwd);
    const root = await git.revparse(["--show-toplevel"]);
    const trimmedRoot = root.trim();
    if (!trimmedRoot) return null;

    // Guard against infinite recursion in pathological submodule configurations.
    if (visited.has(trimmedRoot)) return trimmedRoot;
    visited.add(trimmedRoot);

    // When inside a git submodule, walk up to the top-level superproject root
    // so that project vaults are always anchored at the main repository.
    try {
      const superproject = await git.revparse(["--show-superproject-working-tree"]);
      const trimmedSuperproject = superproject.trim();
      if (trimmedSuperproject) {
        return findGitRoot(trimmedSuperproject, visited);
      }
    } catch {
      // Not inside a submodule or git version does not support the flag; use current root.
    }

    return trimmedRoot;
  } catch {
    return null;
  }
}

export async function ensureGitignore(ignorePath: string): Promise<void> {
  const line = "embeddings/";
  try {
    const existing = await fs.readFile(ignorePath, "utf-8");
    if (!existing.includes(line)) {
      await fs.writeFile(ignorePath, existing.trimEnd() + "\n" + line + "\n");
    }
  } catch {
    await fs.writeFile(ignorePath, line + "\n");
  }
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

