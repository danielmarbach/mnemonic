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

    checkIsRepo.mockResolvedValue(true);
    status.mockResolvedValue({ staged: ["notes/test.md"] });
    getRemotes.mockResolvedValue([{ name: "origin" }]);
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

    it("returns hasRemote:true with empty arrays when sync throws", async () => {
      const { GitOps } = await import("../src/git.js");
      const git = new GitOps("/tmp/repo");
      await git.init();

      fetch.mockRejectedValueOnce(new Error("remote unreachable"));

      const result = await git.sync();

      expect(result).toEqual({ hasRemote: true, pulledNoteIds: [], deletedNoteIds: [], pushedCommits: 0 });
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
  });
});
