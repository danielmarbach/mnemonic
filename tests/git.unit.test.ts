import { beforeEach, describe, expect, it, vi } from "vitest";

const add = vi.fn();
const status = vi.fn();
const commit = vi.fn();
const getRemotes = vi.fn();
const push = vi.fn();
const checkIsRepo = vi.fn();
const init = vi.fn();
const log = vi.fn();
const raw = vi.fn();
const fetch = vi.fn();
const pull = vi.fn();

// fs/promises access mock — controls which git state paths appear to exist
const fsAccess = vi.fn();

vi.mock("fs/promises", () => ({
  access: fsAccess,
}));

vi.mock("simple-git", () => ({
  simpleGit: vi.fn(() => ({
    add,
    status,
    commit,
    getRemotes,
    push,
    checkIsRepo,
    init,
    log,
    raw,
    fetch,
    pull,
  })),
}));

describe("GitOps", () => {
  beforeEach(() => {
    vi.resetModules();
    add.mockReset();
    status.mockReset();
    commit.mockReset();
    getRemotes.mockReset();
    push.mockReset();
    checkIsRepo.mockReset();
    init.mockReset();
    log.mockReset();
    raw.mockReset();
    fetch.mockReset();
    pull.mockReset();
    fsAccess.mockReset();

    checkIsRepo.mockResolvedValue(true);
    status.mockResolvedValue({ staged: ["notes/test.md"] });
    getRemotes.mockResolvedValue([{ name: "origin" }]);
    // Default: no git conflict state files present
    fsAccess.mockRejectedValue(new Error("ENOENT"));
  });

  it("throws when commit fails", async () => {
    const { GitOps } = await import("../src/git.js");
    const git = new GitOps("/tmp/repo");
    await git.init();

    commit.mockRejectedValueOnce(new Error("signing failed"));

    await expect(git.commit("remember: test", ["notes/test.md"])).rejects.toThrow(
      "Git commit failed: signing failed"
    );
  });

  it("passes explicit file paths to git commit so stray staged files are never swept in", async () => {
    const { GitOps } = await import("../src/git.js");
    const git = new GitOps("/tmp/repo");
    await git.init();

    commit.mockResolvedValueOnce(undefined);

    await git.commit("remember: test", ["notes/my-note.md"]);

    expect(add).toHaveBeenCalledWith(["notes/my-note.md"]);
    expect(commit).toHaveBeenCalledWith(expect.any(String), ["notes/my-note.md"]);
  });

  it("falls back to notesRelDir/ when no files are specified, scoping the commit to the notes directory", async () => {
    const { GitOps } = await import("../src/git.js");
    const git = new GitOps("/tmp/repo", ".mnemonic/notes");
    await git.init();

    commit.mockResolvedValueOnce(undefined);

    await git.commit("chore: init vault", []);

    expect(add).toHaveBeenCalledWith([".mnemonic/notes/"]);
    expect(commit).toHaveBeenCalledWith(expect.any(String), [".mnemonic/notes/"]);
  });

  it("returns false when there is nothing staged to commit", async () => {
    const { GitOps } = await import("../src/git.js");
    const git = new GitOps("/tmp/repo");
    await git.init();

    status.mockResolvedValueOnce({ staged: [] });

    await expect(git.commit("remember: test", ["notes/test.md"])).resolves.toBe(false);
    expect(commit).not.toHaveBeenCalled();
  });

  it("returns failed status when push fails", async () => {
    const { GitOps } = await import("../src/git.js");
    const git = new GitOps("/tmp/repo");
    await git.init();

    push.mockRejectedValueOnce(new Error("network down"));

    const result = await git.pushWithStatus();
    expect(result.status).toBe("failed");
    expect(result.error).toContain("network down");
  });

  it("retries git.add() on transient index.lock errors", async () => {
    const { GitOps } = await import("../src/git.js");
    const git = new GitOps("/tmp/repo");
    await git.init();

    // First add() call fails with index.lock, second succeeds
    add.mockRejectedValueOnce(new Error("Unable to create '.git/index.lock': File exists"));
    add.mockResolvedValueOnce(undefined);
    status.mockResolvedValueOnce({ staged: ["notes/test.md"] });
    commit.mockResolvedValueOnce(undefined);

    const result = await git.commitWithStatus("remember: test", ["notes/test.md"]);

    expect(result.status).toBe("committed");
    expect(add).toHaveBeenCalledTimes(2);
  });

  it("returns add failure with operation='add' when all retries exhausted", async () => {
    const { GitOps } = await import("../src/git.js");
    const git = new GitOps("/tmp/repo");
    await git.init();

    // All add() calls fail with index.lock
    add.mockRejectedValue(new Error("Unable to create '.git/index.lock': File exists"));

    const result = await git.commitWithStatus("remember: test", ["notes/test.md"]);

    expect(result.status).toBe("failed");
    expect(result.operation).toBe("add");
    expect(result.error).toContain("index.lock");
    expect(commit).not.toHaveBeenCalled();
  });

  it("returns commit failure with operation='commit' when commit fails after successful add", async () => {
    const { GitOps } = await import("../src/git.js");
    const git = new GitOps("/tmp/repo");
    await git.init();

    add.mockResolvedValueOnce(undefined);
    status.mockResolvedValueOnce({ staged: ["notes/test.md"] });
    commit.mockRejectedValueOnce(new Error("signing failed"));

    const result = await git.commitWithStatus("remember: test", ["notes/test.md"]);

    expect(result.status).toBe("failed");
    expect(result.operation).toBe("commit");
    expect(result.error).toContain("signing failed");
  });

  describe("sync", () => {
    it("returns hasRemote:false when no remotes configured", async () => {
      const { GitOps } = await import("../src/git.js");
      const git = new GitOps("/tmp/repo");
      await git.init();

      getRemotes.mockResolvedValueOnce([]);

      const result = await git.sync();

      expect(result).toEqual({ hasRemote: false, pulledNoteIds: [], deletedNoteIds: [], pushedCommits: 0 });
      expect(fetch).not.toHaveBeenCalled();
    });

    it("returns hasRemote:true with empty arrays when no notes changed", async () => {
      const { GitOps } = await import("../src/git.js");
      const git = new GitOps("/tmp/repo");
      await git.init();

      fetch.mockResolvedValueOnce(undefined);
      raw.mockResolvedValueOnce("2\n"); // countUnpushedCommits
      log.mockResolvedValueOnce({ latest: { hash: "abc123" } }); // currentHead
      pull.mockResolvedValueOnce(undefined);
      raw.mockResolvedValueOnce(""); // diffNotesSince — no changes
      push.mockResolvedValueOnce(undefined);

      const result = await git.sync();

      expect(result).toEqual({ hasRemote: true, pulledNoteIds: [], deletedNoteIds: [], pushedCommits: 2 });
      expect(fetch).toHaveBeenCalledOnce();
      expect(pull).toHaveBeenCalledWith(["--rebase"]);
      expect(push).toHaveBeenCalledOnce();
    });

    it("returns pulledNoteIds for added and modified notes", async () => {
      const { GitOps } = await import("../src/git.js");
      const git = new GitOps("/tmp/repo");
      await git.init();

      fetch.mockResolvedValueOnce(undefined);
      raw.mockResolvedValueOnce("0\n"); // countUnpushedCommits
      log.mockResolvedValueOnce({ latest: { hash: "deadbeef" } }); // currentHead
      pull.mockResolvedValueOnce(undefined);
      raw.mockResolvedValueOnce(
        "A\tnotes/note-added.md\nM\tnotes/note-modified.md\n"
      ); // diffNotesSince
      push.mockResolvedValueOnce(undefined);

      const result = await git.sync();

      expect(result.hasRemote).toBe(true);
      expect(result.pulledNoteIds).toEqual(["note-added", "note-modified"]);
      expect(result.deletedNoteIds).toEqual([]);
    });

    it("returns deletedNoteIds for deleted notes", async () => {
      const { GitOps } = await import("../src/git.js");
      const git = new GitOps("/tmp/repo");
      await git.init();

      fetch.mockResolvedValueOnce(undefined);
      raw.mockResolvedValueOnce("1\n"); // countUnpushedCommits
      log.mockResolvedValueOnce({ latest: { hash: "cafebabe" } }); // currentHead
      pull.mockResolvedValueOnce(undefined);
      raw.mockResolvedValueOnce("D\tnotes/old-note.md\n"); // diffNotesSince
      push.mockResolvedValueOnce(undefined);

      const result = await git.sync();

      expect(result.hasRemote).toBe(true);
      expect(result.pulledNoteIds).toEqual([]);
      expect(result.deletedNoteIds).toEqual(["old-note"]);
    });

    it("includes renamed notes in pulledNoteIds", async () => {
      const { GitOps } = await import("../src/git.js");
      const git = new GitOps("/tmp/repo");
      await git.init();

      fetch.mockResolvedValueOnce(undefined);
      raw.mockResolvedValueOnce("0\n");
      log.mockResolvedValueOnce({ latest: { hash: "feedface" } });
      pull.mockResolvedValueOnce(undefined);
      raw.mockResolvedValueOnce("R100\tnotes/old-name.md\tnotes/new-name.md\n"); // diffNotesSince rename
      push.mockResolvedValueOnce(undefined);

      const result = await git.sync();

      expect(result.pulledNoteIds).toContain("old-name");
    });

    it("ignores non-md files in diff output", async () => {
      const { GitOps } = await import("../src/git.js");
      const git = new GitOps("/tmp/repo");
      await git.init();

      fetch.mockResolvedValueOnce(undefined);
      raw.mockResolvedValueOnce("0\n");
      log.mockResolvedValueOnce({ latest: { hash: "11223344" } });
      pull.mockResolvedValueOnce(undefined);
      raw.mockResolvedValueOnce(
        "A\tnotes/note.md\nA\tnotes/embeddings.json\nM\tnotes/config.toml\n"
      );
      push.mockResolvedValueOnce(undefined);

      const result = await git.sync();

      expect(result.pulledNoteIds).toEqual(["note"]);
    });

    it("returns gitError with phase:fetch when fetch fails", async () => {
      const { GitOps } = await import("../src/git.js");
      const git = new GitOps("/tmp/repo");
      await git.init();

      fetch.mockRejectedValueOnce(new Error("remote unreachable"));

      const result = await git.sync();

      expect(result.hasRemote).toBe(true);
      expect(result.pulledNoteIds).toEqual([]);
      expect(result.deletedNoteIds).toEqual([]);
      expect(result.pushedCommits).toBe(0);
      expect(result.gitError).toEqual({ phase: "fetch", message: "remote unreachable", isConflict: false });
    });

    it("returns gitError with isConflict:true when pull fails and status shows conflicted files", async () => {
      const { GitOps } = await import("../src/git.js");
      const git = new GitOps("/tmp/repo");
      await git.init();

      fetch.mockResolvedValueOnce(undefined);
      raw.mockResolvedValueOnce("0\n"); // countUnpushedCommits
      log.mockResolvedValueOnce({ latest: { hash: "deadbeef" } }); // currentHead
      pull.mockRejectedValueOnce(new Error("pull failed"));
      // getConflictFiles calls status()
      status.mockResolvedValueOnce({ staged: [], conflicted: ["notes/foo.md", "notes/bar.md"] });

      const result = await git.sync();

      expect(result.gitError?.phase).toBe("pull");
      expect(result.gitError?.isConflict).toBe(true);
      expect(result.gitError?.conflictFiles).toEqual(["notes/foo.md", "notes/bar.md"]);
    });

    it("returns gitError with isConflict:true when git state files indicate rebase in progress", async () => {
      const { GitOps } = await import("../src/git.js");
      const git = new GitOps("/tmp/repo");
      await git.init();

      fetch.mockResolvedValueOnce(undefined);
      raw.mockResolvedValueOnce("0\n");
      log.mockResolvedValueOnce({ latest: { hash: "deadbeef" } });
      pull.mockRejectedValueOnce(new Error("error: could not apply abc1234"));
      // git status shows no conflicted files (edge case) but rebase-merge dir exists
      status.mockResolvedValueOnce({ staged: [], conflicted: [] });
      // First access call (.git/rebase-merge) resolves → rebase in progress
      fsAccess.mockResolvedValueOnce(undefined);

      const result = await git.sync();

      expect(result.gitError?.phase).toBe("pull");
      expect(result.gitError?.isConflict).toBe(true);
    });

    it("returns gitError with isConflict:false when pull fails for non-conflict reasons", async () => {
      const { GitOps } = await import("../src/git.js");
      const git = new GitOps("/tmp/repo");
      await git.init();

      fetch.mockResolvedValueOnce(undefined);
      raw.mockResolvedValueOnce("0\n");
      log.mockResolvedValueOnce({ latest: { hash: "deadbeef" } });
      pull.mockRejectedValueOnce(new Error("fatal: repository not found"));
      // No conflicted files, no git state files
      status.mockResolvedValueOnce({ staged: [], conflicted: [] });
      fsAccess.mockRejectedValue(new Error("ENOENT")); // no state files

      const result = await git.sync();

      expect(result.gitError?.phase).toBe("pull");
      expect(result.gitError?.isConflict).toBe(false);
    });

    it("returns partial success with gitError when push fails after successful pull", async () => {
      const { GitOps } = await import("../src/git.js");
      const git = new GitOps("/tmp/repo");
      await git.init();

      fetch.mockResolvedValueOnce(undefined);
      raw.mockResolvedValueOnce("1\n"); // countUnpushedCommits
      log.mockResolvedValueOnce({ latest: { hash: "aabbccdd" } }); // currentHead
      pull.mockResolvedValueOnce(undefined);
      raw.mockResolvedValueOnce("A\tnotes/synced-note.md\n"); // diffNotesSince
      push.mockRejectedValueOnce(new Error("rejected: non-fast-forward"));

      const result = await git.sync();

      // Pull succeeded — pulled notes should be present
      expect(result.hasRemote).toBe(true);
      expect(result.pulledNoteIds).toEqual(["synced-note"]);
      expect(result.pushedCommits).toBe(0);
      expect(result.gitError).toEqual({ phase: "push", message: "rejected: non-fast-forward", isConflict: false });
    });

    it("uses custom notesRelDir when diffing notes", async () => {
      const { GitOps } = await import("../src/git.js");
      const git = new GitOps("/tmp/project", ".mnemonic/notes");
      await git.init();

      fetch.mockResolvedValueOnce(undefined);
      raw.mockResolvedValueOnce("0\n");
      log.mockResolvedValueOnce({ latest: { hash: "aabbccdd" } });
      pull.mockResolvedValueOnce(undefined);
      raw.mockResolvedValueOnce("A\t.mnemonic/notes/proj-note.md\n"); // diffNotesSince with project prefix
      push.mockResolvedValueOnce(undefined);

      const result = await git.sync();

      expect(result.pulledNoteIds).toEqual(["proj-note"]);
    });

    it("returns staged and modified files from status()", async () => {
      const { GitOps } = await import("../src/git.js");
      const git = new GitOps("/tmp/repo");
      await git.init();

      status.mockResolvedValueOnce({
        staged: ["notes/note1.md", "notes/note2.md"],
        modified: ["notes/note3.md"],
        conflicted: [],
      });

      const result = await git.status();

      expect(result.staged).toEqual(["notes/note1.md", "notes/note2.md"]);
      expect(result.modified).toEqual(["notes/note3.md"]);
    });

    it("returns empty arrays when git is disabled", async () => {
      process.env.DISABLE_GIT = "true";
      vi.resetModules();

      const { GitOps } = await import("../src/git.js");
      const git = new GitOps("/tmp/repo");
      await git.init();

      const result = await git.status();

      expect(result.staged).toEqual([]);
      expect(result.modified).toEqual([]);

      delete process.env.DISABLE_GIT;
    });

    it("returns empty arrays when status() throws", async () => {
      const { GitOps } = await import("../src/git.js");
      const git = new GitOps("/tmp/repo");
      await git.init();

      status.mockRejectedValueOnce(new Error("not a git repository"));

      const result = await git.status();

      expect(result.staged).toEqual([]);
      expect(result.modified).toEqual([]);
    });
  });
});
