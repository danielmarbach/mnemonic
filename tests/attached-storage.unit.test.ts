import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { simpleGit } from "simple-git";
import { Storage, type Note, type EmbeddingRecord } from "../src/storage.js";
import { AttachedStorage, detectDefaultBranch, validateBranch } from "../src/attached-storage.js";
import { AttachedVaultReadOnlyError, InvalidBranchNameError } from "../src/domain-errors.js";
import { memoryId, isoDateString, embeddingModelId } from "../src/brands.js";
import * as fs from "fs/promises";
import * as path from "path";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

async function initGitRepo(dir: string, readmeContent: string): Promise<void> {
  const git = simpleGit(dir);
  await git.init();
  await git.addConfig("user.email", "test@example.com");
  await git.addConfig("user.name", "Test");
  await git.addConfig("init.defaultBranch", "main");
  // Ensure the branch is named "main" regardless of system default
  await execFileAsync("git", ["checkout", "-b", "main"], { cwd: dir }).catch(() => {});
  await fs.writeFile(path.join(dir, "README.md"), readmeContent);
}

async function initGitRepoWithCommit(dir: string, readmeContent: string): Promise<void> {
  await initGitRepo(dir, readmeContent);
  await execFileAsync("git", ["add", "README.md"], { cwd: dir });
  await execFileAsync(
    "git",
    [
      "-c",
      "user.email=test@example.com",
      "-c",
      "user.name=Test",
      "commit",
      "-m",
      "chore: initial commit",
    ],
    { cwd: dir },
  );
}

function makeNote(id: string, overrides: Partial<Note> = {}): Note {
  const now = new Date().toISOString();
  return {
    id: memoryId(id),
    title: id,
    content: `Content of ${id}`,
    tags: [],
    lifecycle: "permanent",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("validateBranch", () => {
  it("accepts valid branch names", () => {
    expect(() => validateBranch("main")).not.toThrow();
    expect(() => validateBranch("feature/foo")).not.toThrow();
    expect(() => validateBranch("release-1.0")).not.toThrow();
    expect(() => validateBranch("fix_123")).not.toThrow();
    expect(() => validateBranch("a-b-c_d/e")).not.toThrow();
  });

  it("rejects invalid branch names", () => {
    expect(() => validateBranch("branch with spaces")).toThrow(InvalidBranchNameError);
    expect(() => validateBranch("branch\twith\ttabs")).toThrow(InvalidBranchNameError);
    expect(() => validateBranch("branch;injection")).toThrow(InvalidBranchNameError);
    expect(() => validateBranch("branch`code`")).toThrow(InvalidBranchNameError);
    expect(() => validateBranch("$(cmd)")).toThrow(InvalidBranchNameError);
  });

  it("includes the branch name and pattern in the error message", () => {
    try {
      validateBranch("bad branch");
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidBranchNameError);
      expect((err as InvalidBranchNameError).message).toContain("bad branch");
      expect((err as InvalidBranchNameError).message).toContain("^[a-zA-Z0-9._/-]+$");
    }
  });
});

describe("AttachedStorage", () => {
  let tempDir: string;
  let baseStorage: Storage;
  let originalDisableGit: string | undefined;

  beforeEach(async () => {
    originalDisableGit = process.env.DISABLE_GIT;
    process.env.DISABLE_GIT = "true";
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mnemonic-attached-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    if (originalDisableGit === undefined) {
      delete process.env.DISABLE_GIT;
    } else {
      process.env.DISABLE_GIT = originalDisableGit;
    }
  });

  describe("property delegation", () => {
    it("delegates vaultPath to baseStorage", () => {
      baseStorage = new Storage(path.join(tempDir, "vault"));
      const repoStorage = new Storage(path.join(tempDir, "repo-vault"));
      const attached = new AttachedStorage(baseStorage, repoStorage, "/repo", "main", "notes");
      expect(attached.vaultPath).toBe(baseStorage.vaultPath);
    });

    it("delegates notesDir to baseStorage", () => {
      baseStorage = new Storage(path.join(tempDir, "vault"));
      const repoStorage = new Storage(path.join(tempDir, "repo-vault"));
      const attached = new AttachedStorage(baseStorage, repoStorage, "/repo", "main", "notes");
      expect(attached.notesDir).toBe(baseStorage.notesDir);
    });

    it("delegates embeddingsDir to baseStorage", () => {
      baseStorage = new Storage(path.join(tempDir, "vault"));
      const repoStorage = new Storage(path.join(tempDir, "repo-vault"));
      const attached = new AttachedStorage(baseStorage, repoStorage, "/repo", "main", "notes");
      expect(attached.embeddingsDir).toBe(baseStorage.embeddingsDir);
    });

    it("delegates projectionsDir to baseStorage", () => {
      baseStorage = new Storage(path.join(tempDir, "vault"));
      const repoStorage = new Storage(path.join(tempDir, "repo-vault"));
      const attached = new AttachedStorage(baseStorage, repoStorage, "/repo", "main", "notes");
      expect(attached.projectionsDir).toBe(baseStorage.projectionsDir);
    });
  });

  describe("init", () => {
    it("delegates init to baseStorage", async () => {
      baseStorage = new Storage(path.join(tempDir, "vault"));
      const repoStorage = new Storage(path.join(tempDir, "repo-vault"));
      const attached = new AttachedStorage(baseStorage, repoStorage, "/repo", "main", "notes");
      await attached.init();
      await fs.stat(path.join(tempDir, "vault", "notes"));
    });
  });

  describe("working-tree fallback (branch === '')", () => {
    let attached: AttachedStorage;

    beforeEach(async () => {
      baseStorage = new Storage(path.join(tempDir, "vault"));
      await baseStorage.init();
      const repoStorage = new Storage(path.join(tempDir, "vault"));
      await repoStorage.init();
      attached = new AttachedStorage(baseStorage, repoStorage, "/nonexistent-repo", "", "notes");
    });

    it("listNoteIds delegates to baseStorage", async () => {
      await baseStorage.writeNote(makeNote("alpha"));
      await baseStorage.writeNote(makeNote("beta"));
      const ids = await attached.listNoteIds();
      expect(ids).toContain(memoryId("alpha"));
      expect(ids).toContain(memoryId("beta"));
    });

    it("readNote delegates to baseStorage", async () => {
      await baseStorage.writeNote(makeNote("alpha"));
      const note = await attached.readNote(memoryId("alpha"));
      expect(note).toBeTruthy();
      expect(note!.id).toBe(memoryId("alpha"));
    });

    it("readNote returns null for missing note", async () => {
      const note = await attached.readNote(memoryId("nonexistent"));
      expect(note).toBeNull();
    });
  });

  describe("git-ref reads (branch set)", () => {
    let repoDir: string;

    beforeEach(async () => {
      repoDir = await fs.mkdtemp(path.join(os.tmpdir(), "mnemonic-attached-repo-"));
    });

    afterEach(async () => {
      await fs.rm(repoDir, { recursive: true, force: true }).catch(() => {});
    });

    it("listNoteIds reads from git branch using ls-tree", async () => {
      await initGitRepoWithCommit(repoDir, "# Init");
      delete process.env.DISABLE_GIT;

      const notesDir = path.join(repoDir, ".mnemonic", "notes");
      await fs.mkdir(notesDir, { recursive: true });

      const noteContent = `---
title: Test Note
tags: []
lifecycle: permanent
createdAt: 2024-01-01T00:00:00.000Z
updatedAt: 2024-01-01T00:00:00.000Z
---

Test note body`;

      await fs.writeFile(path.join(notesDir, "my-note.md"), noteContent, "utf-8");

      const git = simpleGit(repoDir);
      await git.add(".mnemonic/notes/my-note.md");
      await git.commit("add note");

      baseStorage = new Storage(path.join(tempDir, "vault"));
      await baseStorage.init();
      const attached = new AttachedStorage(
        baseStorage,
        baseStorage,
        repoDir,
        "main",
        ".mnemonic/notes",
      );

      const ids = await attached.listNoteIds();
      expect(ids).toContain(memoryId("my-note"));

      process.env.DISABLE_GIT = "true";
    });

    it("readNote reads from git branch using git show", async () => {
      await initGitRepoWithCommit(repoDir, "# Init");
      delete process.env.DISABLE_GIT;

      const notesDir = path.join(repoDir, ".mnemonic", "notes");
      await fs.mkdir(notesDir, { recursive: true });

      const noteContent = `---
title: Branch Note
tags: [tag1]
lifecycle: permanent
createdAt: 2024-01-01T00:00:00.000Z
updatedAt: 2024-01-01T00:00:00.000Z
---

Branch note body`;

      await fs.writeFile(path.join(notesDir, "branch-note.md"), noteContent, "utf-8");

      const git = simpleGit(repoDir);
      await git.add(".mnemonic/notes/branch-note.md");
      await git.commit("add branch note");

      baseStorage = new Storage(path.join(tempDir, "vault"));
      await baseStorage.init();
      const attached = new AttachedStorage(
        baseStorage,
        baseStorage,
        repoDir,
        "main",
        ".mnemonic/notes",
      );

      const note = await attached.readNote(memoryId("branch-note"));
      expect(note).toBeTruthy();
      expect(note!.id).toBe(memoryId("branch-note"));
      expect(note!.title).toBe("Branch Note");
      expect(note!.content).toBe("Branch note body");

      process.env.DISABLE_GIT = "true";
    });

    it("readNote returns null for missing note on branch", async () => {
      await initGitRepoWithCommit(repoDir, "# Init");
      delete process.env.DISABLE_GIT;

      baseStorage = new Storage(path.join(tempDir, "vault"));
      await baseStorage.init();
      const attached = new AttachedStorage(
        baseStorage,
        baseStorage,
        repoDir,
        "main",
        ".mnemonic/notes",
      );

      const note = await attached.readNote(memoryId("nonexistent"));
      expect(note).toBeNull();

      process.env.DISABLE_GIT = "true";
    });

    it("listNoteIds filters to .md files only", async () => {
      await initGitRepoWithCommit(repoDir, "# Init");
      delete process.env.DISABLE_GIT;

      const notesDir = path.join(repoDir, ".mnemonic", "notes");
      await fs.mkdir(notesDir, { recursive: true });
      await fs.writeFile(
        path.join(notesDir, "real-note.md"),
        "---\ntitle: Real\ntags: []\nlifecycle: permanent\ncreatedAt: 2024-01-01T00:00:00.000Z\nupdatedAt: 2024-01-01T00:00:00.000Z\n---\n\nBody",
        "utf-8",
      );
      await fs.writeFile(path.join(notesDir, "data.json"), "{}", "utf-8");

      const git = simpleGit(repoDir);
      await git.add(".mnemonic/notes/");
      await git.commit("add files");

      baseStorage = new Storage(path.join(tempDir, "vault"));
      await baseStorage.init();
      const attached = new AttachedStorage(
        baseStorage,
        baseStorage,
        repoDir,
        "main",
        ".mnemonic/notes",
      );

      const ids = await attached.listNoteIds();
      expect(ids).toContain(memoryId("real-note"));
      expect(ids).not.toContain(memoryId("data"));

      process.env.DISABLE_GIT = "true";
    });

    it("throws InvalidBranchNameError when branch name is invalid", async () => {
      baseStorage = new Storage(path.join(tempDir, "vault"));
      await baseStorage.init();
      const attached = new AttachedStorage(
        baseStorage,
        baseStorage,
        repoDir,
        "bad branch;rm -rf /",
        ".mnemonic/notes",
      );

      await expect(attached.listNoteIds()).rejects.toThrow(InvalidBranchNameError);
      await expect(attached.readNote(memoryId("x"))).rejects.toThrow(InvalidBranchNameError);
    });

    it("reads from a non-main branch", async () => {
      await initGitRepoWithCommit(repoDir, "# Init");
      delete process.env.DISABLE_GIT;

      await execFileAsync("git", ["checkout", "-b", "feature/test"], { cwd: repoDir });

      const notesDir = path.join(repoDir, ".mnemonic", "notes");
      await fs.mkdir(notesDir, { recursive: true });
      await fs.writeFile(
        path.join(notesDir, "feature-note.md"),
        "---\ntitle: Feature Note\ntags: []\nlifecycle: permanent\ncreatedAt: 2024-01-01T00:00:00.000Z\nupdatedAt: 2024-01-01T00:00:00.000Z\n---\n\nFeature body",
        "utf-8",
      );

      const git = simpleGit(repoDir);
      await git.add(".mnemonic/notes/feature-note.md");
      await git.commit("add feature note");

      baseStorage = new Storage(path.join(tempDir, "vault"));
      await baseStorage.init();
      const attached = new AttachedStorage(
        baseStorage,
        baseStorage,
        repoDir,
        "feature/test",
        ".mnemonic/notes",
      );

      const ids = await attached.listNoteIds();
      expect(ids).toContain(memoryId("feature-note"));

      process.env.DISABLE_GIT = "true";
    });
  });

  describe("caching", () => {
    it("listNoteIds caches results and returns same reference on second call", async () => {
      baseStorage = new Storage(path.join(tempDir, "vault"));
      await baseStorage.init();

      await baseStorage.writeNote(makeNote("cached-id"));
      const attached = new AttachedStorage(baseStorage, baseStorage, "/irrelevant", "", "notes");

      const ids1 = await attached.listNoteIds();
      const ids2 = await attached.listNoteIds();
      expect(ids1).toBe(ids2); // same reference (cached)
    });

    it("readNote caches results in git-branch mode and returns same Note object on second call", async () => {
      const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), "mnemonic-attached-cache-read-"));
      try {
        await initGitRepoWithCommit(repoDir, "# Init");
        delete process.env.DISABLE_GIT;

        const notesDir = path.join(repoDir, ".mnemonic", "notes");
        await fs.mkdir(notesDir, { recursive: true });
        await fs.writeFile(
          path.join(notesDir, "cached-read.md"),
          "---\ntitle: Cached Read\ntags: []\nlifecycle: permanent\ncreatedAt: 2024-01-01T00:00:00.000Z\nupdatedAt: 2024-01-01T00:00:00.000Z\n---\n\nCached read body",
          "utf-8",
        );

        const git = simpleGit(repoDir);
        await git.add(".mnemonic/notes/cached-read.md");
        await git.commit("add cached read note");

        baseStorage = new Storage(path.join(tempDir, "vault"));
        await baseStorage.init();
        const attached = new AttachedStorage(
          baseStorage,
          baseStorage,
          repoDir,
          "main",
          ".mnemonic/notes",
        );

        const note1 = await attached.readNote(memoryId("cached-read"));
        const note2 = await attached.readNote(memoryId("cached-read"));
        expect(note1).toBe(note2); // same reference (cached via git)

        process.env.DISABLE_GIT = "true";
      } finally {
        await fs.rm(repoDir, { recursive: true, force: true }).catch(() => {});
      }
    });

    it("invalidateCache clears noteIdCache so next listNoteIds returns fresh results", async () => {
      baseStorage = new Storage(path.join(tempDir, "vault"));
      await baseStorage.init();

      await baseStorage.writeNote(makeNote("x"));
      const attached = new AttachedStorage(baseStorage, baseStorage, "/irrelevant", "", "notes");

      const ids1 = await attached.listNoteIds();
      expect(ids1).toContain(memoryId("x"));

      attached.invalidateCache();

      const ids2 = await attached.listNoteIds();
      expect(ids2).toContain(memoryId("x"));
      // Not same reference — cache was cleared and repopulated
      expect(ids1).not.toBe(ids2);
    });

    it("invalidateCache clears noteCache so next readNote returns fresh results", async () => {
      baseStorage = new Storage(path.join(tempDir, "vault"));
      await baseStorage.init();

      await baseStorage.writeNote(makeNote("y"));
      const attached = new AttachedStorage(baseStorage, baseStorage, "/irrelevant", "", "notes");

      const note1 = await attached.readNote(memoryId("y"));
      expect(note1).toBeTruthy();

      attached.invalidateCache();

      const note2 = await attached.readNote(memoryId("y"));
      expect(note2).toBeTruthy();
      expect(note2!.id).toBe(memoryId("y"));
      // Different reference — cache was cleared
      expect(note1).not.toBe(note2);
    });
  });

  describe("write operations throw AttachedVaultReadOnlyError (non-writable)", () => {
    let attached: AttachedStorage;

    beforeEach(async () => {
      baseStorage = new Storage(path.join(tempDir, "vault"));
      await baseStorage.init();
      attached = new AttachedStorage(baseStorage, baseStorage, "/repo", "main", "notes", false);
    });

    it("writeNote throws", async () => {
      await expect(attached.writeNote(makeNote("whatever"))).rejects.toThrow(
        AttachedVaultReadOnlyError,
      );
      try {
        await attached.writeNote(makeNote("whatever"));
      } catch (err) {
        expect((err as AttachedVaultReadOnlyError).message).toContain("write note");
      }
    });

    it("deleteNote throws", async () => {
      await expect(attached.deleteNote(memoryId("whatever"))).rejects.toThrow(
        AttachedVaultReadOnlyError,
      );
      try {
        await attached.deleteNote(memoryId("whatever"));
      } catch (err) {
        expect((err as AttachedVaultReadOnlyError).message).toContain("delete note");
      }
    });

    it("beginAtomicNotesWrite throws", async () => {
      await expect(attached.beginAtomicNotesWrite()).rejects.toThrow(AttachedVaultReadOnlyError);
      try {
        await attached.beginAtomicNotesWrite();
      } catch (err) {
        expect((err as AttachedVaultReadOnlyError).message).toContain("begin atomic write");
      }
    });

    it("commitAtomicNotesWrite throws", async () => {
      await expect(attached.commitAtomicNotesWrite()).rejects.toThrow(AttachedVaultReadOnlyError);
      try {
        await attached.commitAtomicNotesWrite();
      } catch (err) {
        expect((err as AttachedVaultReadOnlyError).message).toContain("commit atomic write");
      }
    });

    it("rollbackAtomicNotesWrite throws", async () => {
      await expect(attached.rollbackAtomicNotesWrite()).rejects.toThrow(AttachedVaultReadOnlyError);
      try {
        await attached.rollbackAtomicNotesWrite();
      } catch (err) {
        expect((err as AttachedVaultReadOnlyError).message).toContain("rollback atomic write");
      }
    });
  });

  describe("write operations delegate to baseStorage (writable)", () => {
    let attached: AttachedStorage;

    beforeEach(async () => {
      baseStorage = new Storage(path.join(tempDir, "vault"));
      await baseStorage.init();
      attached = new AttachedStorage(baseStorage, baseStorage, "/repo", "main", "notes", true);
    });

    it("writeNote delegates to baseStorage", async () => {
      const note = makeNote("writable-note");
      await attached.writeNote(note);
      const readBack = await baseStorage.readNote(memoryId("writable-note"));
      expect(readBack).toBeTruthy();
      expect(readBack!.id).toBe(memoryId("writable-note"));
    });

    it("deleteNote delegates to baseStorage", async () => {
      const note = makeNote("to-delete");
      await baseStorage.writeNote(note);
      const deleted = await attached.deleteNote(memoryId("to-delete"));
      expect(deleted).toBe(true);
      const readBack = await baseStorage.readNote(memoryId("to-delete"));
      expect(readBack).toBeNull();
    });

    it("beginAtomicNotesWrite delegates to baseStorage", async () => {
      await expect(attached.beginAtomicNotesWrite()).resolves.toBeUndefined();
    });

    it("commitAtomicNotesWrite delegates to baseStorage", async () => {
      await attached.beginAtomicNotesWrite();
      await expect(attached.commitAtomicNotesWrite()).resolves.toBeUndefined();
    });

    it("rollbackAtomicNotesWrite delegates to baseStorage", async () => {
      await attached.beginAtomicNotesWrite();
      await expect(attached.rollbackAtomicNotesWrite()).resolves.toBeUndefined();
    });
  });

  describe("embedding/projection operations delegate to baseStorage", () => {
    let attached: AttachedStorage;

    beforeEach(async () => {
      baseStorage = new Storage(path.join(tempDir, "vault"));
      await baseStorage.init();
      attached = new AttachedStorage(baseStorage, baseStorage, "/repo", "main", "notes");
    });

    it("readEmbedding delegates to baseStorage", async () => {
      const now = new Date().toISOString();
      const record: EmbeddingRecord = {
        id: memoryId("test-emb"),
        model: embeddingModelId("nomic-embed-text"),
        embedding: [0.1, 0.2],
        updatedAt: isoDateString(now),
      };
      await baseStorage.writeEmbedding(record);
      const result = await attached.readEmbedding(memoryId("test-emb"));
      expect(result).toEqual(record);
    });

    it("writeEmbedding delegates to baseStorage", async () => {
      const now = new Date().toISOString();
      const record: EmbeddingRecord = {
        id: memoryId("test-emb-w"),
        model: embeddingModelId("nomic-embed-text"),
        embedding: [0.3, 0.4],
        updatedAt: isoDateString(now),
      };
      await baseStorage.writeEmbedding(record);
      const result = await baseStorage.readEmbedding(memoryId("test-emb-w"));
      expect(result).toEqual(record);
    });

    it("listEmbeddings delegates to baseStorage", async () => {
      const now = new Date().toISOString();
      const record: EmbeddingRecord = {
        id: memoryId("emb-list"),
        model: embeddingModelId("nomic-embed-text"),
        embedding: [0.5],
        updatedAt: isoDateString(now),
      };
      await baseStorage.writeEmbedding(record);
      const list = await attached.listEmbeddings();
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe(memoryId("emb-list"));
    });

    it("readProjection delegates to baseStorage", async () => {
      const proj = {
        noteId: "proj-note",
        title: "Test Projection",
        summary: "A summary",
        headings: ["H1"],
        tags: ["tag1"],
        projectionText: "full text",
        generatedAt: isoDateString("2024-01-01T00:00:00.000Z"),
      };
      await baseStorage.writeProjection(proj);
      const result = await attached.readProjection(memoryId("proj-note"));
      expect(result).toBeTruthy();
      expect(result!.noteId).toBe("proj-note");
    });

    it("writeProjection delegates to baseStorage", async () => {
      const proj = {
        noteId: "proj-write",
        title: "Write Projection",
        summary: "A summary",
        headings: [],
        tags: [],
        projectionText: "full text",
        generatedAt: isoDateString("2024-01-01T00:00:00.000Z"),
      };
      await baseStorage.writeProjection(proj);
      const result = await attached.readProjection(memoryId("proj-write"));
      expect(result).toBeTruthy();
      expect(result!.noteId).toBe("proj-write");
    });

    it("notePath delegates to baseStorage", () => {
      expect(attached.notePath(memoryId("abc"))).toBe(baseStorage.notePath(memoryId("abc")));
    });

    it("embeddingPath delegates to baseStorage", () => {
      expect(attached.embeddingPath(memoryId("abc"))).toBe(
        baseStorage.embeddingPath(memoryId("abc")),
      );
    });

    it("projectionPath delegates to baseStorage", () => {
      expect(attached.projectionPath(memoryId("abc"))).toBe(
        baseStorage.projectionPath(memoryId("abc")),
      );
    });
  });

  describe("fail-soft on git errors", () => {
    it("listNoteIds returns empty array for invalid repo path", async () => {
      baseStorage = new Storage(path.join(tempDir, "vault"));
      await baseStorage.init();
      const attached = new AttachedStorage(
        baseStorage,
        baseStorage,
        "/nonexistent/path/to/repo",
        "main",
        ".mnemonic/notes",
      );

      const ids = await attached.listNoteIds();
      expect(ids).toEqual([]);
    });

    it("readNote returns null for invalid repo path", async () => {
      baseStorage = new Storage(path.join(tempDir, "vault"));
      await baseStorage.init();
      const attached = new AttachedStorage(
        baseStorage,
        baseStorage,
        "/nonexistent/path/to/repo",
        "main",
        ".mnemonic/notes",
      );

      const note = await attached.readNote(memoryId("missing"));
      expect(note).toBeNull();
    });

    it("listNoteIds returns empty array for non-existent branch", async () => {
      const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), "mnemonic-attached-nobranch-"));
      try {
        await initGitRepoWithCommit(repoDir, "# Init");
        delete process.env.DISABLE_GIT;

        baseStorage = new Storage(path.join(tempDir, "vault"));
        await baseStorage.init();
        const attached = new AttachedStorage(
          baseStorage,
          baseStorage,
          repoDir,
          "nonexistent-branch",
          ".mnemonic/notes",
        );

        const ids = await attached.listNoteIds();
        expect(ids).toEqual([]);
      } finally {
        process.env.DISABLE_GIT = "true";
        await fs.rm(repoDir, { recursive: true, force: true }).catch(() => {});
      }
    });

    it("readNote returns null for non-existent branch", async () => {
      const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), "mnemonic-attached-nobranch-read-"));
      try {
        await initGitRepoWithCommit(repoDir, "# Init");
        delete process.env.DISABLE_GIT;

        baseStorage = new Storage(path.join(tempDir, "vault"));
        await baseStorage.init();
        const attached = new AttachedStorage(
          baseStorage,
          baseStorage,
          repoDir,
          "nonexistent-branch",
          ".mnemonic/notes",
        );

        const note = await attached.readNote(memoryId("no-note"));
        expect(note).toBeNull();
      } finally {
        process.env.DISABLE_GIT = "true";
        await fs.rm(repoDir, { recursive: true, force: true }).catch(() => {});
      }
    });
  });

  describe("listNotes", () => {
    it("returns all notes when no filter provided", async () => {
      baseStorage = new Storage(path.join(tempDir, "vault"));
      await baseStorage.init();

      await baseStorage.writeNote(makeNote("proj-a", { project: "alpha" }));
      await baseStorage.writeNote(makeNote("proj-b", { project: "beta" }));
      await baseStorage.writeNote(makeNote("proj-none"));

      const attached = new AttachedStorage(baseStorage, baseStorage, "/repo", "", "notes");

      const all = await attached.listNotes();
      expect(all).toHaveLength(3);
    });

    it("filters notes by project name", async () => {
      baseStorage = new Storage(path.join(tempDir, "vault"));
      await baseStorage.init();

      await baseStorage.writeNote(makeNote("proj-a", { project: "alpha" }));
      await baseStorage.writeNote(makeNote("proj-b", { project: "beta" }));

      const attached = new AttachedStorage(baseStorage, baseStorage, "/repo", "", "notes");

      const alphaOnly = await attached.listNotes({ project: "alpha" });
      expect(alphaOnly).toHaveLength(1);
      expect(alphaOnly[0].id).toBe(memoryId("proj-a"));
    });
  });
});

describe("detectDefaultBranch", () => {
  let repoDir: string;
  let originalDisableGit: string | undefined;

  beforeEach(async () => {
    originalDisableGit = process.env.DISABLE_GIT;
    delete process.env.DISABLE_GIT;
    repoDir = await fs.mkdtemp(path.join(os.tmpdir(), "mnemonic-detect-branch-"));
  });

  afterEach(async () => {
    await fs.rm(repoDir, { recursive: true, force: true }).catch(() => {});
    if (originalDisableGit === undefined) {
      delete process.env.DISABLE_GIT;
    } else {
      process.env.DISABLE_GIT = originalDisableGit;
    }
  });

  it("detects main via symbolic-ref when origin/HEAD points to main", async () => {
    await initGitRepoWithCommit(repoDir, "# Init");
    await execFileAsync("git", ["remote", "add", "origin", repoDir], { cwd: repoDir });
    await execFileAsync(
      "git",
      ["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main"],
      { cwd: repoDir },
    );

    const branch = await detectDefaultBranch(repoDir);
    expect(branch).toBe("main");
  });

  it("detects master via symbolic-ref when origin/HEAD points to master", async () => {
    await initGitRepoWithCommit(repoDir, "# Init");
    // Create a branch called "master" (different from default "main")
    await execFileAsync("git", ["checkout", "-b", "master"], { cwd: repoDir });
    await fs.writeFile(path.join(repoDir, "master-file.txt"), "content");
    await execFileAsync("git", ["add", "master-file.txt"], { cwd: repoDir });
    await execFileAsync(
      "git",
      [
        "-c",
        "user.email=test@example.com",
        "-c",
        "user.name=Test",
        "commit",
        "-m",
        "master commit",
      ],
      { cwd: repoDir },
    );
    await execFileAsync("git", ["remote", "add", "origin", repoDir], { cwd: repoDir });
    await execFileAsync(
      "git",
      ["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/master"],
      { cwd: repoDir },
    );

    const branch = await detectDefaultBranch(repoDir);
    expect(branch).toBe("master");
  });

  it("falls back to main when origin/main exists as remote branch", async () => {
    await initGitRepoWithCommit(repoDir, "# Init");
    const bareDir = await fs.mkdtemp(path.join(os.tmpdir(), "mnemonic-detect-bare-"));
    await execFileAsync("git", ["init", "--bare", "--initial-branch=main"], { cwd: bareDir });

    await execFileAsync("git", ["remote", "add", "origin", bareDir], { cwd: repoDir });
    await execFileAsync("git", ["push", "origin", "main"], { cwd: repoDir });

    const branch = await detectDefaultBranch(repoDir);
    expect(branch).toBe("main");

    await fs.rm(bareDir, { recursive: true, force: true }).catch(() => {});
  });

  it("falls back to master when origin/master exists and origin/main does not", async () => {
    // Create a bare repo with master as default branch
    const bareDir = await fs.mkdtemp(path.join(os.tmpdir(), "mnemonic-detect-bare-master-"));
    await execFileAsync("git", ["init", "--bare", "--initial-branch=master"], { cwd: bareDir });

    // Create a local repo, rename its branch to master, then push
    await initGitRepoWithCommit(repoDir, "# Init");
    // The default branch in initGitRepo is "main" — rename it to "master"
    await execFileAsync("git", ["branch", "-M", "master"], { cwd: repoDir });

    await execFileAsync("git", ["remote", "add", "origin", bareDir], { cwd: repoDir });
    await execFileAsync("git", ["push", "-u", "origin", "master"], { cwd: repoDir });

    const branch = await detectDefaultBranch(repoDir);
    expect(branch).toBe("master");

    await fs.rm(bareDir, { recursive: true, force: true }).catch(() => {});
  });

  it("defaults to main when no remote branches match", async () => {
    await initGitRepoWithCommit(repoDir, "# Init");
    // No remote — symbolic-ref will fail, branch -r will be empty
    const branch = await detectDefaultBranch(repoDir);
    expect(branch).toBe("main");
  });
});
