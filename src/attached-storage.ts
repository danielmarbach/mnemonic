import path from "path";
import { simpleGit } from "simple-git";
import { memoryId, type MemoryId } from "./brands.js";
import { Storage, type Note, type NoteStorage, type EmbeddingRecord } from "./storage.js";
import type { NoteProjection } from "./structured-content.js";
import { attempt, debugLog, getErrorMessage } from "./error-utils.js";
import { InvalidBranchNameError, AttachedVaultReadOnlyError } from "./domain-errors.js";

const VALID_BRANCH_PATTERN = /^[a-zA-Z0-9._/-]+$/;

export function validateBranch(branch: string): void {
  if (!VALID_BRANCH_PATTERN.test(branch)) {
    throw new InvalidBranchNameError(branch, VALID_BRANCH_PATTERN.source);
  }
}

export class AttachedStorage implements NoteStorage {
  private baseStorage: Storage;
  private repoPath: string;
  private branch: string;
  private noteCache = new Map<string, Note>();
  private noteIdCache: MemoryId[] | null = null;
  private notesRelDir: string;
  private writable: boolean;

  constructor(baseStorage: Storage, repoPath: string, branch: string, notesRelDir: string, writable: boolean = false) {
    this.baseStorage = baseStorage;
    this.repoPath = repoPath;
    this.branch = branch;
    this.notesRelDir = notesRelDir;
    this.writable = writable;
  }

  get vaultPath(): string { return this.baseStorage.vaultPath; }
  get notesDir(): string { return this.baseStorage.notesDir; }
  get embeddingsDir(): string { return this.baseStorage.embeddingsDir; }
  get projectionsDir(): string { return this.baseStorage.projectionsDir; }

  async init(): Promise<void> {
    await this.baseStorage.init();
  }

  async listNoteIds(): Promise<MemoryId[]> {
    if (this.noteIdCache !== null) return this.noteIdCache;

    if (this.branch === "") {
      this.noteIdCache = await this.baseStorage.listNoteIds();
      return this.noteIdCache;
    }

    validateBranch(this.branch);

    const result = await attempt("attached-storage:list-note-ids", async () => {
      const git = simpleGit(this.repoPath);
      const output = await git.raw(["ls-tree", "--name-only", this.branch, this.notesRelDir + "/"]);
      return output
        .trim()
        .split("\n")
        .filter(line => line.endsWith(".md"))
        .map(line => {
          const filename = line.trim();
          const basename = path.basename(filename, ".md");
          return memoryId(basename);
        })
        .filter(id => id.length > 0);
    });

    if (!result.ok) {
      debugLog("attached-storage:list-note-ids", `failed: ${getErrorMessage(result.error)}`);
      return [];
    }

    this.noteIdCache = result.value;
    return this.noteIdCache;
  }

  async readNote(id: MemoryId): Promise<Note | null> {
    const cached = this.noteCache.get(id);
    if (cached) return cached;

    if (this.branch === "") {
      return this.baseStorage.readNote(id);
    }

    validateBranch(this.branch);

    const notePath = `${this.notesRelDir}/${id}.md`;
    const result = await attempt("attached-storage:read-note", async () => {
      const git = simpleGit(this.repoPath);
      const content = await git.raw(["show", `${this.branch}:${notePath}`]);
      return content;
    });

    if (!result.ok || !result.value) {
      debugLog("attached-storage:read-note", `failed for ${id}: ${result.ok ? "empty" : getErrorMessage(result.error)}`);
      return null;
    }

    const note = this.baseStorage.parseNote(id, result.value.trim());
    if (note) this.noteCache.set(id, note);
    return note;
  }

  async listNotes(filter?: { project?: string | null }): Promise<Note[]> {
    const ids = await this.listNoteIds();
    const notes: Note[] = [];
    for (const id of ids) {
      const note = await this.readNote(id);
      if (note && (!filter?.project || note.project === filter.project)) {
        notes.push(note);
      }
    }
    return notes;
  }

  async writeNote(note: Note): Promise<void> {
    if (this.writable) {
      return this.baseStorage.writeNote(note);
    }
    throw new AttachedVaultReadOnlyError("write note");
  }

  async deleteNote(id: MemoryId): Promise<boolean> {
    if (this.writable) {
      return this.baseStorage.deleteNote(id);
    }
    throw new AttachedVaultReadOnlyError("delete note");
  }

  async beginAtomicNotesWrite(): Promise<void> {
    if (this.writable) {
      return this.baseStorage.beginAtomicNotesWrite();
    }
    throw new AttachedVaultReadOnlyError("begin atomic write");
  }

  async commitAtomicNotesWrite(): Promise<void> {
    if (this.writable) {
      return this.baseStorage.commitAtomicNotesWrite();
    }
    throw new AttachedVaultReadOnlyError("commit atomic write");
  }

  async rollbackAtomicNotesWrite(): Promise<void> {
    if (this.writable) {
      return this.baseStorage.rollbackAtomicNotesWrite();
    }
    throw new AttachedVaultReadOnlyError("rollback atomic write");
  }

  async readEmbedding(id: MemoryId): Promise<EmbeddingRecord | null> {
    return this.baseStorage.readEmbedding(id);
  }

  async writeEmbedding(record: EmbeddingRecord): Promise<void> {
    return this.baseStorage.writeEmbedding(record);
  }

  async listEmbeddings(): Promise<EmbeddingRecord[]> {
    return this.baseStorage.listEmbeddings();
  }

  async readProjection(id: MemoryId): Promise<NoteProjection | null> {
    return this.baseStorage.readProjection(id);
  }

  async writeProjection(projection: NoteProjection): Promise<void> {
    return this.baseStorage.writeProjection(projection);
  }

  notePath(id: MemoryId): string {
    return this.baseStorage.notePath(id);
  }

  embeddingPath(id: MemoryId): string {
    return this.baseStorage.embeddingPath(id);
  }

  projectionPath(id: MemoryId): string {
    return this.baseStorage.projectionPath(id);
  }

  invalidateCache(): void {
    this.noteCache.clear();
    this.noteIdCache = null;
  }
}

export async function detectDefaultBranch(repoPath: string): Promise<string> {
  const git = simpleGit(repoPath);

  const symResult = await attempt("attached-storage:detect-branch", async () => {
    const output = await git.raw(["symbolic-ref", "refs/remotes/origin/HEAD"]);
    const match = output.trim().match(/^refs\/remotes\/origin\/(.+)$/);
    return match?.[1] ?? null;
  });
  if (symResult.ok && symResult.value) return symResult.value;

  const branches = await attempt("attached-storage:list-branches", async () => {
    const output = await git.raw(["branch", "-r", "--list", "origin/main"]);
    return output.trim().length > 0;
  });
  if (branches.ok && branches.value) return "main";

  const masterCheck = await attempt("attached-storage:list-branches", async () => {
    const output = await git.raw(["branch", "-r", "--list", "origin/master"]);
    return output.trim().length > 0;
  });
  if (masterCheck.ok && masterCheck.value) return "master";

  return "main";
}