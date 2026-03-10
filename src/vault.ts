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
}

// ── VaultManager ─────────────────────────────────────────────────────────────

export class VaultManager {
  readonly main: Vault;
  /** Project vaults loaded this session, keyed by resolved git root. */
  private projectVaults = new Map<string, Vault>();
  /** Git root of the main vault — set after initMain(). */
  private mainGitRoot = "";

  constructor(mainVaultPath: string) {
    const resolved = path.resolve(mainVaultPath);
    this.main = makeVault(resolved, resolved, "notes", false);
  }

  async initMain(): Promise<void> {
    await this.main.storage.init();
    await this.main.git.init();
    await ensureGitignore(path.join(this.main.storage.vaultPath, ".gitignore"));
    this.mainGitRoot = (await findGitRoot(this.main.storage.vaultPath)) ?? this.main.storage.vaultPath;
  }

  /**
   * Get or create the project vault for the given cwd.
   * Creates <git-root>/.mnemonic/ if it does not exist yet.
   * Returns null when cwd is not inside a git repo or belongs to the main vault's repo.
   */
  async getOrCreateProjectVault(cwd: string): Promise<Vault | null> {
    const gitRoot = await findGitRoot(cwd);
    if (!gitRoot || this.isMainRepo(gitRoot)) return null;
    return this.loadProjectVault(gitRoot, true);
  }

  /**
   * Return the project vault only if .mnemonic/ already exists — never creates.
   * Returns null when the vault does not exist yet.
   */
  async getProjectVaultIfExists(cwd: string): Promise<Vault | null> {
    const gitRoot = await findGitRoot(cwd);
    if (!gitRoot || this.isMainRepo(gitRoot)) return null;
    return this.loadProjectVault(gitRoot, false);
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

  /** All vaults currently loaded in this session (main + project vaults). */
  allKnownVaults(): Vault[] {
    return [this.main, ...this.projectVaults.values()];
  }

  /**
   * Ordered list of vaults for recall / list operations.
   * Project vault (if found) comes first, main vault last.
   */
  async searchOrder(cwd?: string): Promise<Vault[]> {
    const vaults: Vault[] = [];
    if (cwd) {
      const pv = await this.getProjectVaultIfExists(cwd);
      if (pv) vaults.push(pv);
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

  private async loadProjectVault(gitRoot: string, create: boolean): Promise<Vault | null> {
    const resolved = path.resolve(gitRoot);

    if (this.projectVaults.has(resolved)) {
      return this.projectVaults.get(resolved)!;
    }

    const mnemonicPath = path.join(resolved, ".mnemonic");

    if (!create && !(await pathExists(mnemonicPath))) return null;

    const vault = makeVault(mnemonicPath, resolved, ".mnemonic/notes", true);
    await vault.storage.init();
    await vault.git.init();

    const gitignorePath = path.join(mnemonicPath, ".gitignore");
    const isNew = !(await pathExists(gitignorePath));
    await ensureGitignore(gitignorePath);

    if (isNew) {
      // Commit the .gitignore so collaborators also ignore embeddings/
      await vault.git.commit("chore: initialize .mnemonic vault", [".mnemonic/.gitignore"]);
    }

    this.projectVaults.set(resolved, vault);
    return vault;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeVault(
  vaultPath: string,
  gitRoot: string,
  notesRelDir: string,
  isProject: boolean,
): Vault {
  return {
    storage: new Storage(vaultPath),
    git: new GitOps(gitRoot, notesRelDir),
    notesRelDir,
    isProject,
  };
}

async function findGitRoot(cwd: string): Promise<string | null> {
  try {
    const git = simpleGit(cwd);
    const root = await git.revparse(["--show-toplevel"]);
    return root.trim();
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
