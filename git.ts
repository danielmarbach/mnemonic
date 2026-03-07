import { simpleGit, SimpleGit } from "simple-git";

export interface SyncResult {
  hasRemote: boolean;
  /** Note ids that arrived or changed during pull (need re-embedding) */
  pulledNoteIds: string[];
  /** Note ids that were deleted on remote */
  deletedNoteIds: string[];
  /** Number of local commits pushed to remote */
  pushedCommits: number;
}

export class GitOps {
  private git!: SimpleGit;
  private readonly vaultPath: string;
  private enabled: boolean;

  constructor(vaultPath: string) {
    this.vaultPath = vaultPath;
    this.enabled = process.env["DISABLE_GIT"] !== "true";
  }

  async init(): Promise<void> {
    // Defer simpleGit construction until here — the vault directory is
    // created by Storage.init() before GitOps.init() is called.
    this.git = simpleGit(this.vaultPath);
    if (!this.enabled) return;
    const isRepo = await this.git.checkIsRepo().catch(() => false);
    if (!isRepo) {
      await this.git.init();
      console.error("[git] Initialized new repository");
    }
  }

  async commit(message: string, files?: string[]): Promise<void> {
    if (!this.enabled) return;
    try {
      if (files && files.length > 0) {
        await this.git.add(files);
      } else {
        await this.git.add(".");
      }
      const status = await this.git.status();
      if (status.staged.length === 0) return;
      await this.git.commit(message);
      console.error(`[git] Committed: ${message}`);
    } catch (err) {
      console.error(`[git] Commit failed: ${err}`);
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
      // Fetch so we can diff before pulling
      await this.git.fetch();

      // Count local commits not yet on remote (to report pushed count later)
      const unpushed = await this.countUnpushedCommits();

      // Record local HEAD before pull so we can diff what changed
      const localHead = await this.currentHead();

      // Pull with rebase to keep history linear and avoid merge commits
      await this.git.pull(["--rebase"]);
      console.error("[git] Pulled (rebase)");

      // Diff what changed between old local HEAD and new HEAD
      const { pulledNoteIds, deletedNoteIds } = await this.diffNotesSince(localHead);

      // Push any local commits (including ones that existed before the pull)
      await this.git.push();
      console.error(`[git] Pushed ${unpushed} local commit(s)`);

      return { hasRemote: true, pulledNoteIds, deletedNoteIds, pushedCommits: unpushed };
    } catch (err) {
      console.error(`[git] Sync failed: ${err}`);
      // Return partial result — caller will handle gracefully
      return { hasRemote: true, pulledNoteIds: [], deletedNoteIds: [], pushedCommits: 0 };
    }
  }

  /** Push only — used after individual remember/update/forget commits */
  async push(): Promise<void> {
    if (!this.enabled) return;
    try {
      const remotes = await this.git.getRemotes();
      if (remotes.length === 0) return;
      await this.git.push();
      console.error("[git] Pushed");
    } catch (err) {
      console.error(`[git] Push failed: ${err}`);
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
      // git rev-list @{u}..HEAD — commits ahead of upstream
      const result = await this.git.raw(["rev-list", "--count", "@{u}..HEAD"]);
      return parseInt(result.trim(), 10) || 0;
    } catch {
      return 0;
    }
  }

  /**
   * Returns note ids that were added/modified or deleted between `sinceHash`
   * and the current HEAD, by looking at changes to notes/*.md files.
   */
  private async diffNotesSince(
    sinceHash: string
  ): Promise<{ pulledNoteIds: string[]; deletedNoteIds: string[] }> {
    if (!sinceHash) return { pulledNoteIds: [], deletedNoteIds: [] };

    try {
      // --name-status gives lines like "M notes/foo.md" or "D notes/bar.md"
      const diff = await this.git.raw([
        "diff",
        "--name-status",
        sinceHash,
        "HEAD",
        "--",
        "notes/",
      ]);

      const pulledNoteIds: string[] = [];
      const deletedNoteIds: string[] = [];

      for (const line of diff.split("\n")) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 2) continue;
        const [status, filePath] = parts as [string, string];
        if (!filePath?.endsWith(".md")) continue;

        // Extract id from path like "notes/my-note-a1b2c3.md"
        const id = filePath.replace(/^notes\//, "").replace(/\.md$/, "");

        if (status === "D") {
          deletedNoteIds.push(id);
        } else if (status === "A" || status === "M" || status.startsWith("R")) {
          // R = renamed (git shows R100 etc.)
          pulledNoteIds.push(id);
        }
      }

      return { pulledNoteIds, deletedNoteIds };
    } catch {
      return { pulledNoteIds: [], deletedNoteIds: [] };
    }
  }
}
