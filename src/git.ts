import { access } from "fs/promises";
import path from "path";
import { simpleGit, SimpleGit } from "simple-git";

export class GitOperationError extends Error {
  constructor(operation: "add" | "commit" | "push", cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`Git ${operation} failed: ${detail}`);
    this.name = "GitOperationError";
  }
}

export interface SyncGitError {
  /** Which git operation failed */
  phase: "fetch" | "pull" | "push";
  message: string;
  /** True when the failure is a merge/rebase conflict requiring manual resolution */
  isConflict: boolean;
  /** Files with conflict markers, when detectable */
  conflictFiles?: string[];
}

export interface SyncResult {
  hasRemote: boolean;
  /** Note ids that arrived or changed during pull (need re-embedding) */
  pulledNoteIds: string[];
  /** Note ids that were deleted on remote */
  deletedNoteIds: string[];
  /** Number of local commits pushed to remote */
  pushedCommits: number;
  /** Set when any git operation in the sync sequence failed */
  gitError?: SyncGitError;
}

export interface CommitResult {
  status: "committed" | "skipped" | "failed";
  reason?: "git-disabled" | "no-changes" | "error";
  /** Which operation failed, when status is "failed" */
  operation?: "add" | "commit";
  error?: string;
}

export interface PushResult {
  status: "pushed" | "skipped" | "failed";
  reason?: "git-disabled" | "no-remote" | "auto-push-disabled" | "commit-failed";
  error?: string;
}

export class GitOps {
  private git!: SimpleGit;
  private readonly gitRoot: string;
  /**
   * Notes directory path relative to gitRoot used by diffNotesSince.
   * "notes" for main vault, ".mnemonic/notes" for project vaults.
   */
  private readonly notesRelDir: string;
  private enabled: boolean;

  constructor(gitRoot: string, notesRelDir: string = "notes") {
    this.gitRoot = gitRoot;
    this.notesRelDir = notesRelDir;
    this.enabled = process.env["DISABLE_GIT"] !== "true";
  }

  async init(): Promise<void> {
    // Defer simpleGit construction until here — the vault directory is
    // created by Storage.init() before GitOps.init() is called.
    this.git = simpleGit(this.gitRoot);
    if (!this.enabled) return;
    const isRepo = await this.git.checkIsRepo().catch(() => false);
    if (!isRepo) {
      await this.git.init();
      console.error("[git] Initialized new repository");
    }
  }

  /**
   * Commit files to the git repo. Files should be paths relative to gitRoot.
   * Callers are responsible for building the correct paths (including any
   * .mnemonic/ prefix for project vaults).
   *
   * Message format protocol:
   * - First line: tool(action): Brief description (50 chars max recommended)
   * - Body (optional): Additional details with standardized fields
   *
   * Standard body fields:
   * - Note: <id> (<title>)
   * - Notes: <count> notes affected
   * - Project: <project-name>
   * - Scope: project|global
   * - Tags: <tag1>, <tag2>
   * - Relationship: <from-id> <type> <to-id>
   * - Mode: <mode> (for consolidation)
   * - Files: <file1>, <file2>
   */
  async commit(message: string, files: string[], body?: string): Promise<boolean> {
    const result = await this.commitWithStatus(message, files, body);
    if (result.status === "failed") {
      throw new GitOperationError("commit", result.error ?? "unknown commit failure");
    }
    return result.status === "committed";
  }

  async commitWithStatus(message: string, files: string[], body?: string): Promise<CommitResult> {
    if (!this.enabled) return { status: "skipped", reason: "git-disabled" };

    // Scope every add+commit to only the paths mnemonic manages.
    // Never commit files outside the vault — e.g. src/ or test/ changes
    // that happen to be staged in the same repo.
    const scopedFiles = files.length > 0 ? files : [`${this.notesRelDir}/`];

    // Retry git.add() with exponential backoff for transient index.lock errors.
    // git.add() can fail with "Unable to create '.git/index.lock': File exists"
    // when concurrent git operations race for the index. This is recoverable
    // by retrying after a short delay.
    const addResult = await this.addWithRetry(scopedFiles);
    if (addResult.status === "failed") {
      return addResult;
    }

    try {
      const status = await this.git.status();
      if (status.staged.length === 0) return { status: "skipped", reason: "no-changes" };

      // Build commit message with optional body
      const fullMessage = body ? `${message}\n\n${body}` : message;
      await this.git.commit(fullMessage, scopedFiles);

      const displayMessage = body ? `${message} [...]` : message;
      console.error(`[git] Committed: ${displayMessage}`);
      return { status: "committed" };
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : String(err);
      console.error(`[git] Commit failed: ${errMessage}`);
      return { status: "failed", reason: "error", operation: "commit", error: errMessage };
    }
  }

  /**
   * Retry git.add() with exponential backoff for transient index.lock errors.
   * Returns a CommitResult-like object for add failures.
   */
  private async addWithRetry(files: string[]): Promise<CommitResult> {
    const maxRetries = 3;
    const baseDelayMs = 50;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await this.git.add(files);
        return { status: "committed" };
      } catch (err) {
        const errMessage = err instanceof Error ? err.message : String(err);
        const isLockError = errMessage.includes("index.lock") || errMessage.includes("File exists");

        if (isLockError && attempt < maxRetries - 1) {
          const delayMs = baseDelayMs * Math.pow(2, attempt);
          console.error(`[git] add() lock contention, retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }

        console.error(`[git] add() failed: ${errMessage}`);
        return { status: "failed", reason: "error", operation: "add", error: errMessage };
      }
    }

    // Should be unreachable, but TypeScript needs a return
    return { status: "failed", reason: "error", operation: "add", error: "max retries exceeded" };
  }

  /**
   * Get git status for checking uncommitted changes.
   * Returns staged and modified files.
   */
  async status(): Promise<{ staged: string[]; modified: string[] }> {
    if (!this.enabled) return { staged: [], modified: [] };
    try {
      const status = await this.git.status();
      return {
        staged: status.staged,
        modified: status.modified,
      };
    } catch {
      return { staged: [], modified: [] };
    }
  }

  /**
   * Bidirectional sync: fetch → count unpushed local commits → pull (rebase)
   * → push. Returns details about what changed so callers can trigger
   * re-embedding for notes that arrived from the remote.
   */
  async sync(): Promise<SyncResult> {
    const empty: SyncResult = {
      hasRemote: false,
      pulledNoteIds: [],
      deletedNoteIds: [],
      pushedCommits: 0,
    };

    if (!this.enabled) return empty;

    const remotes = await this.git.getRemotes();
    if (remotes.length === 0) return empty;

    const withRemote: Pick<SyncResult, "hasRemote" | "pulledNoteIds" | "deletedNoteIds" | "pushedCommits"> = {
      hasRemote: true,
      pulledNoteIds: [],
      deletedNoteIds: [],
      pushedCommits: 0,
    };

    // Phase 1: fetch
    try {
      await this.git.fetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[git] Sync fetch failed: ${message}`);
      return { ...withRemote, gitError: { phase: "fetch", message, isConflict: false } };
    }

    const unpushed = await this.countUnpushedCommits();
    const localHead = await this.currentHead();

    // Phase 2: pull (rebase)
    try {
      await this.git.pull(["--rebase"]);
      console.error("[git] Pulled (rebase)");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[git] Sync pull failed: ${message}`);
      // Use language-independent checks: conflicted files from git status (porcelain codes,
      // not localized) and git internal state files (.git/rebase-merge, .git/rebase-apply,
      // .git/MERGE_HEAD) rather than error message keywords.
      const conflictFiles = await this.getConflictFiles();
      const isConflict = conflictFiles.length > 0 || await this.isConflictInProgress();
      return {
        ...withRemote,
        gitError: {
          phase: "pull",
          message,
          isConflict,
          conflictFiles: conflictFiles.length > 0 ? conflictFiles : undefined,
        },
      };
    }

    const { pulledNoteIds, deletedNoteIds } = await this.diffNotesSince(localHead);

    // Phase 3: push
    try {
      await this.git.push();
      console.error(`[git] Pushed ${unpushed} local commit(s)`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[git] Sync push failed: ${message}`);
      // Pull succeeded — return partial success with the pulled notes and the push error
      return {
        hasRemote: true,
        pulledNoteIds,
        deletedNoteIds,
        pushedCommits: 0,
        gitError: { phase: "push", message, isConflict: false },
      };
    }

    return { hasRemote: true, pulledNoteIds, deletedNoteIds, pushedCommits: unpushed };
  }

  private async getConflictFiles(): Promise<string[]> {
    try {
      const status = await this.git.status();
      return status.conflicted;
    } catch {
      return [];
    }
  }

  /**
   * Checks git's internal state files to detect an in-progress rebase or merge conflict.
   * Language-independent: these paths are git internals, not localized error messages.
   */
  private async isConflictInProgress(): Promise<boolean> {
    const gitDir = path.join(this.gitRoot, ".git");
    const statePaths = [
      path.join(gitDir, "rebase-merge"),   // interactive / --merge rebase
      path.join(gitDir, "rebase-apply"),   // --apply strategy rebase
      path.join(gitDir, "MERGE_HEAD"),     // plain merge conflict
    ];
    for (const p of statePaths) {
      try {
        await access(p);
        return true;
      } catch {
        // not present — try next
      }
    }
    return false;
  }

  /** Push only — used after individual remember/update/forget commits */
  async push(): Promise<void> {
    await this.pushWithStatus();
  }

  async pushWithStatus(): Promise<PushResult> {
    if (!this.enabled) return { status: "skipped", reason: "git-disabled" };
    try {
      const remotes = await this.git.getRemotes();
      if (remotes.length === 0) return { status: "skipped", reason: "no-remote" };
      await this.git.push();
      console.error("[git] Pushed");
      return { status: "pushed" };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[git] Push failed: ${message}`);
      return { status: "failed", error: message };
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private async currentHead(): Promise<string> {
    try {
      const log = await this.git.log({ maxCount: 1 });
      return log.latest?.hash ?? "";
    } catch {
      return "";
    }
  }

  private async countUnpushedCommits(): Promise<number> {
    try {
      const result = await this.git.raw(["rev-list", "--count", "@{u}..HEAD"]);
      return parseInt(result.trim(), 10) || 0;
    } catch {
      return 0;
    }
  }

  /**
   * Returns note ids added/modified/deleted between sinceHash and HEAD,
   * scoped to this vault's notesRelDir.
   */
  private async diffNotesSince(
    sinceHash: string
  ): Promise<{ pulledNoteIds: string[]; deletedNoteIds: string[] }> {
    if (!sinceHash) return { pulledNoteIds: [], deletedNoteIds: [] };

    try {
      const diff = await this.git.raw([
        "diff",
        "--name-status",
        sinceHash,
        "HEAD",
        "--",
        `${this.notesRelDir}/`,
      ]);

      const pulledNoteIds: string[] = [];
      const deletedNoteIds: string[] = [];
      const prefix = `${this.notesRelDir}/`;

      for (const line of diff.split("\n")) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 2) continue;
        const [status, filePath] = parts as [string, string];
        if (!filePath?.endsWith(".md")) continue;

        const id = filePath.replace(prefix, "").replace(/\.md$/, "");

        if (status === "D") {
          deletedNoteIds.push(id);
        } else if (status === "A" || status === "M" || status.startsWith("R")) {
          pulledNoteIds.push(id);
        }
      }

      return { pulledNoteIds, deletedNoteIds };
    } catch {
      return { pulledNoteIds: [], deletedNoteIds: [] };
    }
  }
}
