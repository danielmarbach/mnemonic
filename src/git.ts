import { simpleGit, SimpleGit } from "simple-git";

export class GitOperationError extends Error {
  constructor(operation: "commit" | "push", cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`Git ${operation} failed: ${detail}`);
    this.name = "GitOperationError";
  }
}

export interface SyncResult {
  hasRemote: boolean;
  /** Note ids that arrived or changed during pull (need re-embedding) */
  pulledNoteIds: string[];
  /** Note ids that were deleted on remote */
  deletedNoteIds: string[];
  /** Number of local commits pushed to remote */
  pushedCommits: number;
}

export interface CommitResult {
  status: "committed" | "skipped";
  reason?: "git-disabled" | "no-changes";
}

export interface PushResult {
  status: "pushed" | "skipped" | "failed";
  reason?: "git-disabled" | "no-remote" | "auto-push-disabled";
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
    return result.status === "committed";
  }

  async commitWithStatus(message: string, files: string[], body?: string): Promise<CommitResult> {
    if (!this.enabled) return { status: "skipped", reason: "git-disabled" };
    try {
      // Scope every add+commit to only the paths mnemonic manages.
      // Never commit files outside the vault — e.g. src/ or test/ changes
      // that happen to be staged in the same repo.
      const scopedFiles = files.length > 0 ? files : [`${this.notesRelDir}/`];
      await this.git.add(scopedFiles);
      const status = await this.git.status();
      if (status.staged.length === 0) return { status: "skipped", reason: "no-changes" };

      // Build commit message with optional body
      const fullMessage = body ? `${message}\n\n${body}` : message;
      await this.git.commit(fullMessage, scopedFiles);

      const displayMessage = body ? `${message} [...]` : message;
      console.error(`[git] Committed: ${displayMessage}`);
      return { status: "committed" };
    } catch (err) {
      console.error(`[git] Commit failed: ${err}`);
      throw new GitOperationError("commit", err);
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

    try {
      await this.git.fetch();
      const unpushed = await this.countUnpushedCommits();
      const localHead = await this.currentHead();
      await this.git.pull(["--rebase"]);
      console.error("[git] Pulled (rebase)");
      const { pulledNoteIds, deletedNoteIds } = await this.diffNotesSince(localHead);
      await this.git.push();
      console.error(`[git] Pushed ${unpushed} local commit(s)`);
      return { hasRemote: true, pulledNoteIds, deletedNoteIds, pushedCommits: unpushed };
    } catch (err) {
      console.error(`[git] Sync failed: ${err}`);
      return { hasRemote: true, pulledNoteIds: [], deletedNoteIds: [], pushedCommits: 0 };
    }
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
