import fs from "fs/promises";
import path from "path";
import { simpleGit } from "simple-git";

import { attempt, debugLog, getErrorMessage } from "./error-utils.js";
import { Storage, type Note, type NoteStorage } from "./storage.js";
import { memoryId } from "./brands.js";
import { GitOps } from "./git.js";
import { AttachedStorage } from "./attached-storage.js";
import { expandHomePath } from "./paths.js";

// ── Public types ──────────────────────────────────────────────────────────────

export type VaultProvenance = "main" | "project-local" | "project-attached";

export interface AttachmentRef {
  projectSlug: string;
  projectName: string;
  localPath: string;
  branch: string;
  branchTipHash: string;
  writable?: boolean;
  pushBranch?: string;
}

export interface ProjectAttachmentConfig {
  projectSlug: string;
  projectName: string;
  localPath: string;
  vaultFolder: string;
  enabled: boolean;
  branch: string;
  addedAt: string;
  updatedAt: string;
  branchTipHash: string;
  writable?: boolean;
  pushBranch?: string;
}

export interface Vault {
  storage: NoteStorage;
  git: GitOps;
  /**
   * Notes directory path relative to the vault's git root.
   * "notes" for the main vault, ".mnemonic/notes" for project vaults.
   */
  notesRelDir: string;
  provenance: VaultProvenance;
  /**
   * Vault folder name relative to the git root.
   * - "" for the main vault (it is its own standalone git repo).
   * - ".mnemonic" for the primary project vault.
   * - ".mnemonic-<name>" for submodule-specific project vaults.
   */
  vaultFolderName: string;
  /** Ref metadata for attached vaults. Only present when provenance === "project-attached". */
  attachmentRef?: AttachmentRef;
  /** Whether this vault allows write operations. Computed from provenance. */
  readonly writable: boolean;
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
  /** Attached vault configs per project slug, set by tools after reading from configStore. */
  private attachmentConfigs = new Map<string, ProjectAttachmentConfig[]>();
  /** Attached vault objects per project slug, loaded lazily. */
  private attachedVaults = new Map<string, Vault[]>();
  /** Git root of the main vault — set after initMain(). */
  private mainGitRoot = "";

  constructor(mainVaultPath: string) {
    const resolved = path.resolve(mainVaultPath);
    this.main = makeVault(resolved, resolved, "notes", "main", "");
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
   * When `mutable` is true, excludes attached (read-only) vaults from the search.
   */
  async findNote(id: string, cwd?: string, options?: { mutable?: boolean; projectId?: string }): Promise<{ note: Note; vault: Vault } | null> {
    const memoryIdArg = memoryId(id);
    const vaults = options?.mutable
      ? await this.searchOrderMutable(cwd, options?.projectId)
      : await this.searchOrder(cwd, options?.projectId);
    for (const vault of vaults) {
      const note = await vault.storage.readNote(memoryIdArg);
      if (note) return { note, vault };
    }
    return null;
  }

  /** All vaults currently loaded in this session (main + all project vaults including submodule). */
  allKnownVaults(projectId?: string): Vault[] {
    const all: Vault[] = [this.main];
    for (const vaults of this.allProjectVaultsByRoot.values()) {
      all.push(...vaults);
    }
    if (projectId) {
      const attached = this.attachedVaults.get(projectId);
      if (attached) all.push(...attached);
    }
    return all;
  }

  /** All writable vaults (includes writable attached vaults). */
  allKnownVaultsMutable(): Vault[] {
    const all: Vault[] = [this.main];
    for (const vaults of this.allProjectVaultsByRoot.values()) {
      all.push(...vaults);
    }
    for (const vaults of this.attachedVaults.values()) {
      for (const vault of vaults) {
        if (vault.writable) all.push(vault);
      }
    }
    return all;
  }

  /**
   * Ordered list of vaults for recall / list operations.
   * All project vaults for the cwd's git root come first (primary, then submodule),
   * then attached vaults for the project, followed by the main vault.
   */
  async searchOrder(cwd?: string, projectId?: string): Promise<Vault[]> {
    const vaults: Vault[] = [];
    if (cwd) {
      const gitRoot = await findGitRoot(cwd);
      if (gitRoot && !this.isMainRepo(gitRoot)) {
        const pv = await this.loadAllVaultsForRoot(gitRoot, false);
        if (pv) {
          const all = this.allProjectVaultsByRoot.get(path.resolve(gitRoot));
          if (all) {
            vaults.push(...all);
          } else {
            vaults.push(pv);
          }
        }
      }
    }
    if (projectId) {
      const attached = this.getAttachmentsForProject(projectId);
      if (attached.length > 0) {
        vaults.push(...attached);
      }
    }
    vaults.push(this.main);
    return vaults;
  }

  /**
   * Same as searchOrder but excludes attached (read-only) vaults.
   * Use for mutation operations that must never write to attached vaults.
   */
  async searchOrderMutable(cwd?: string, projectId?: string): Promise<Vault[]> {
    const vaults = await this.searchOrder(cwd, projectId);
    return vaults.filter(v => v.writable);
  }

  /** Build the file path for a note relative to the vault's git root. */
  noteRelPath(vault: Vault, noteId: string): string {
    return `${vault.notesRelDir}/${noteId}.md`;
  }

  /**
   * Check for pending git changes (staged or modified) for specific notes in a vault.
   * Returns file paths that have uncommitted changes from a previous failed attempt.
   */
  async getPendingNoteFiles(vault: Vault, noteIds: string[]): Promise<string[]> {
    const status = await vault.git.status();
    const pendingFiles: string[] = [];
    for (const noteId of noteIds) {
      const filePath = this.noteRelPath(vault, noteId);
      if (status.staged.includes(filePath) || status.modified.includes(filePath)) {
        pendingFiles.push(filePath);
      }
    }
    return pendingFiles;
  }

  // ── Attachments ──────────────────────────────────────────────────────────────

  setAttachmentConfigs(projectSlug: string, configs: ProjectAttachmentConfig[]): void {
    this.attachmentConfigs.set(projectSlug, configs);
  }

  async loadAttachmentsForProject(projectSlug: string): Promise<Vault[]> {
    if (this.attachedVaults.has(projectSlug)) {
      return this.attachedVaults.get(projectSlug)!;
    }

    const configs = this.attachmentConfigs.get(projectSlug) ?? [];
    const enabledConfigs = configs.filter(c => c.enabled);

    const vaultPromises = enabledConfigs.map(async (config) => {
      const resolvedLocalPath = path.resolve(expandHomePath(config.localPath));
      if (!await pathExists(resolvedLocalPath)) {
        debugLog("vault:attachment", `skipping attachment ${config.projectSlug}: path not found ${resolvedLocalPath}`);
        return null;
      }

      // Staleness detection: compare stored branchTipHash against current tip
      let currentTipHash = config.branchTipHash;
      if (config.branch) {
        const tipResult = await attempt("vault:attachment-staleness", async () => {
          const git = simpleGit(resolvedLocalPath);
          const result = await git.raw(["rev-parse", config.branch]);
          return result.trim();
        });
        if (tipResult.ok && tipResult.value) {
          currentTipHash = tipResult.value;
        }
      }

      const attachmentsDir = path.join(resolvedLocalPath, config.vaultFolder, "attachments", projectSlug);
      await fs.mkdir(attachmentsDir, { recursive: true });

      const baseStorage = new Storage(attachmentsDir);
      await baseStorage.init();

      const storage = new AttachedStorage(baseStorage, resolvedLocalPath, config.branch, `${config.vaultFolder}/notes`, config.writable === true);

      const git = new GitOps(resolvedLocalPath, `${config.vaultFolder}/notes`);

      const vault: Vault = {
        storage,
        git,
        notesRelDir: `${config.vaultFolder}/notes`,
        provenance: "project-attached",
        vaultFolderName: config.vaultFolder,
        attachmentRef: {
          projectSlug: config.projectSlug,
          projectName: config.projectName,
          localPath: resolvedLocalPath,
          branch: config.branch,
          branchTipHash: currentTipHash,
          writable: config.writable,
          pushBranch: config.pushBranch,
        },
        get writable() { return config.writable === true; },
      };

      const gitignorePath = path.join(resolvedLocalPath, config.vaultFolder, ".gitignore");
      await ensureGitignore(gitignorePath);

      return vault;
    });

    const vaults = (await Promise.all(vaultPromises)).filter((v): v is Vault => v !== null);

    this.attachedVaults.set(projectSlug, vaults);
    return vaults;
  }

  getAttachmentsForProject(projectSlug: string): Vault[] {
    return this.attachedVaults.get(projectSlug) ?? [];
  }

  removeAttachment(projectSlug: string, targetSlug: string): void {
    const vaults = this.attachedVaults.get(projectSlug);
    if (vaults) {
      this.attachedVaults.set(projectSlug, vaults.filter(v =>
        v.attachmentRef?.projectSlug !== targetSlug
      ));
    }
    const configs = this.attachmentConfigs.get(projectSlug);
    if (configs) {
      this.attachmentConfigs.set(projectSlug, configs.filter(c => c.projectSlug !== targetSlug));
    }
  }

  clearAttachmentCaches(): void {
    this.attachedVaults.clear();
    this.attachmentConfigs.clear();
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

    const primaryVault = makeVault(mnemonicPath, resolved, ".mnemonic/notes", "project-local", ".mnemonic");
    await primaryVault.storage.init();
    await primaryVault.git.init();

    if (create) {
      const gitignorePath = path.join(mnemonicPath, ".gitignore");
      const isNew = !(await pathExists(gitignorePath));
      await ensureGitignore(gitignorePath);

      if (isNew) {
        // Commit the .gitignore so collaborators also ignore embeddings/
        await primaryVault.git.commit("chore: initialize .mnemonic vault", [".mnemonic/.gitignore"]);
      }
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
        "project-local",
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
  provenance: VaultProvenance,
  vaultFolderName: string,
  embeddingsDirOverride?: string,
  attachmentRef?: AttachmentRef,
): Vault {
  return {
    storage: new Storage(vaultPath, embeddingsDirOverride),
    git: new GitOps(gitRoot, notesRelDir),
    notesRelDir,
    provenance,
    vaultFolderName,
    attachmentRef,
    get writable() { return this.provenance !== "project-attached" || this.attachmentRef?.writable === true; },
  };
}

/**
 * Discover submodule vault folder names (`.mnemonic-*`) at the git root.
 * These are siblings of the primary `.mnemonic` vault and provide separate note
 * namespaces for submodule-specific context while sharing the same git history.
 */
async function discoverSubmoduleVaultFolders(gitRoot: string): Promise<string[]> {
  const result = await attempt("vault:discover-submodules", () =>
    fs.readdir(gitRoot, { withFileTypes: true })
  );
  if (!result.ok) {
    debugLog("vault:discover-submodules", `failed: ${getErrorMessage(result.error)}`);
    return [];
  }
  return result.value
    .filter(e => e.isDirectory() && e.name.startsWith(".mnemonic-"))
    .map(e => e.name)
    .sort();
}

async function findGitRoot(cwd: string, visited: Set<string> = new Set()): Promise<string | null> {
  const git = simpleGit(cwd);
  const rootResult = await attempt("vault:find-git-root", () =>
    git.revparse(["--show-toplevel"])
  );
  if (!rootResult.ok) {
    debugLog("vault:find-git-root", `failed: ${getErrorMessage(rootResult.error)}`);
    return null;
  }
  const trimmedRoot = rootResult.value.trim();
  if (!trimmedRoot) return null;

  if (visited.has(trimmedRoot)) return trimmedRoot;
  visited.add(trimmedRoot);

  const superResult = await attempt("vault:find-git-root:superproject", () =>
    git.revparse(["--show-superproject-working-tree"])
  );
  if (superResult.ok) {
    const trimmedSuperproject = superResult.value.trim();
    if (trimmedSuperproject) {
      return findGitRoot(trimmedSuperproject, visited);
    }
  } else {
    debugLog("vault:find-git-root", "not inside a submodule or flag unsupported, using current root");
  }

  return trimmedRoot;
}

export async function ensureGitignore(ignorePath: string): Promise<void> {
  const requiredLines = ["attachments/", "embeddings/", "projections/"];
  const existingResult = await attempt("vault:ensure-gitignore", () =>
    fs.readFile(ignorePath, "utf-8")
  );
  const existing = existingResult.ok ? existingResult.value : (() => {
    debugLog("vault:ensure-gitignore", `no existing gitignore: ${getErrorMessage(existingResult.error)}`);
    return "";
  })();
  const missing = requiredLines.filter(line => !existing.includes(line));
  if (missing.length === 0) return;
  const updated = existing.trimEnd() + "\n" + missing.join("\n") + "\n";
  await fs.writeFile(ignorePath, updated);
}

async function pathExists(p: string): Promise<boolean> {
  const result = await attempt("vault:pathExists", () => fs.access(p));
  return result.ok;
}
