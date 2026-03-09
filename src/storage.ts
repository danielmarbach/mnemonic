import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import matter from "gray-matter";

export type RelationshipType = "related-to" | "explains" | "example-of" | "supersedes";
export type NoteLifecycle = "temporary" | "permanent";
export const NOTE_LIFECYCLES = ["temporary", "permanent"] as const satisfies readonly NoteLifecycle[];

export interface Relationship {
  id: string;
  type: RelationshipType;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  lifecycle: NoteLifecycle;
  /** Stable project identifier, or undefined for global memories */
  project?: string;
  /** Human-readable project name for display */
  projectName?: string;
  relatedTo?: Relationship[];
  createdAt: string;
  updatedAt: string;
  /** Schema version for forward compatibility (0 = pre-v0.2.0) */
  memoryVersion?: number;
}

export interface EmbeddingRecord {
  id: string;
  model: string;
  embedding: number[];
  updatedAt: string;
}

export class Storage {
  readonly vaultPath: string;
  readonly notesDir: string;
  readonly embeddingsDir: string;
  private stagedNotesDir?: string;
  private stagedDeletedNoteIds = new Set<string>();

  constructor(vaultPath: string) {
    this.vaultPath = path.resolve(vaultPath);
    this.notesDir = path.join(this.vaultPath, "notes");
    // Embeddings are local-only — kept outside the synced notes tree
    this.embeddingsDir = path.join(this.vaultPath, "embeddings");
  }

  async init(): Promise<void> {
    await fs.mkdir(this.notesDir, { recursive: true });
    await fs.mkdir(this.embeddingsDir, { recursive: true });
  }

  // ── Notes ──────────────────────────────────────────────────────────────────

  async beginAtomicNotesWrite(): Promise<void> {
    if (this.stagedNotesDir) {
      throw new Error("Atomic notes write already in progress");
    }

    this.stagedNotesDir = path.join(this.vaultPath, `.notes-staging-${randomUUID()}`);
    this.stagedDeletedNoteIds.clear();
    await fs.mkdir(this.stagedNotesDir, { recursive: true });
  }

  async commitAtomicNotesWrite(): Promise<void> {
    if (!this.stagedNotesDir) {
      return;
    }

    const stagedDir = this.stagedNotesDir;
    const stagedFiles = await fs.readdir(stagedDir).catch(() => []);

    for (const file of stagedFiles) {
      if (!file.endsWith(".md")) {
        continue;
      }

      await fs.rename(path.join(stagedDir, file), path.join(this.notesDir, file));
    }

    for (const noteId of this.stagedDeletedNoteIds) {
      try {
        await fs.unlink(this.notePath(noteId));
      } catch {
        // already absent
      }
    }

    await this.clearAtomicNotesWrite();
  }

  async rollbackAtomicNotesWrite(): Promise<void> {
    if (!this.stagedNotesDir) {
      return;
    }

    await this.clearAtomicNotesWrite();
  }

  async writeNote(note: Note): Promise<void> {
    const fileContent = this.serializeNote(note);
    const filePath = this.stagedNotesDir
      ? path.join(this.stagedNotesDir, `${note.id}.md`)
      : this.notePath(note.id);

    this.stagedDeletedNoteIds.delete(note.id);
    await fs.writeFile(filePath, fileContent, "utf-8");
  }

  async readNote(id: string): Promise<Note | null> {
    if (this.stagedDeletedNoteIds.has(id)) {
      return null;
    }

    const stagedPath = this.stagedNotePath(id);
    if (stagedPath) {
      try {
        const raw = await fs.readFile(stagedPath, "utf-8");
        return this.parseNote(id, raw);
      } catch {
        // fall back to committed note
      }
    }

    try {
      const raw = await fs.readFile(this.notePath(id), "utf-8");
      return this.parseNote(id, raw);
    } catch {
      return null;
    }
  }

  async deleteNote(id: string): Promise<boolean> {
    if (this.stagedNotesDir) {
      this.stagedDeletedNoteIds.add(id);
      const stagedPath = this.stagedNotePath(id);
      if (stagedPath) {
        try {
          await fs.unlink(stagedPath);
        } catch {
          // ok
        }
      }
      return true;
    }

    try {
      await fs.unlink(this.notePath(id));
      try { await fs.unlink(this.embeddingPath(id)); } catch { /* ok */ }
      return true;
    } catch {
      return false;
    }
  }

  async listNotes(filter?: { project?: string | null }): Promise<Note[]> {
    const ids = await this.listNoteIds();
    const notes: Note[] = [];

    for (const id of ids) {
      const note = await this.readNote(id);
      if (!note) continue;

      if (filter !== undefined) {
        if (filter.project === null) {
          if (note.project) continue;
        } else if (filter.project !== undefined) {
          if (note.project !== filter.project) continue;
        }
      }

      notes.push(note);
    }
    return notes;
  }

  private serializeNote(note: Note): string {
    const frontmatter: Record<string, unknown> = {
      title: note.title,
      tags: note.tags,
      lifecycle: note.lifecycle,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    };
    if (note.project) {
      frontmatter["project"] = note.project;
      if (note.projectName) frontmatter["projectName"] = note.projectName;
    }
    if (note.relatedTo && note.relatedTo.length > 0) {
      frontmatter["relatedTo"] = note.relatedTo;
    }
    if (note.memoryVersion !== undefined) {
      frontmatter["memoryVersion"] = note.memoryVersion;
    }
    return matter.stringify(note.content, frontmatter);
  }

  // ── Embeddings ─────────────────────────────────────────────────────────────

  async writeEmbedding(record: EmbeddingRecord): Promise<void> {
    await fs.writeFile(
      this.embeddingPath(record.id),
      JSON.stringify(record, null, 2),
      "utf-8"
    );
  }

  async readEmbedding(id: string): Promise<EmbeddingRecord | null> {
    try {
      const raw = await fs.readFile(this.embeddingPath(id), "utf-8");
      return JSON.parse(raw) as EmbeddingRecord;
    } catch {
      return null;
    }
  }

  async listEmbeddings(): Promise<EmbeddingRecord[]> {
    let files: string[];
    try {
      files = await fs.readdir(this.embeddingsDir);
    } catch {
      return [];
    }
    const records: EmbeddingRecord[] = [];
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const id = file.replace(/\.json$/, "");
      const rec = await this.readEmbedding(id);
      if (rec) records.push(rec);
    }
    return records;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  notePath(id: string): string {
    return path.join(this.notesDir, `${id}.md`);
  }

  embeddingPath(id: string): string {
    return path.join(this.embeddingsDir, `${id}.json`);
  }

  private stagedNotePath(id: string): string | undefined {
    return this.stagedNotesDir
      ? path.join(this.stagedNotesDir, `${id}.md`)
      : undefined;
  }

  private async listNoteIds(): Promise<string[]> {
    const ids = new Set<string>();

    try {
      const files = await fs.readdir(this.notesDir);
      for (const file of files) {
        if (file.endsWith(".md")) {
          ids.add(file.replace(/\.md$/, ""));
        }
      }
    } catch {
      // treat as empty
    }

    if (this.stagedNotesDir) {
      try {
        const stagedFiles = await fs.readdir(this.stagedNotesDir);
        for (const file of stagedFiles) {
          if (file.endsWith(".md")) {
            ids.add(file.replace(/\.md$/, ""));
          }
        }
      } catch {
        // treat as empty
      }
    }

    for (const deletedId of this.stagedDeletedNoteIds) {
      ids.delete(deletedId);
    }

    return [...ids].sort();
  }

  private async clearAtomicNotesWrite(): Promise<void> {
    const stagedDir = this.stagedNotesDir;
    this.stagedNotesDir = undefined;
    this.stagedDeletedNoteIds.clear();

    if (stagedDir) {
      await fs.rm(stagedDir, { recursive: true, force: true });
    }
  }

  private parseNote(id: string, raw: string): Note {
    if (!raw.trimStart().startsWith("---")) {
      throw new Error(`Malformed note '${id}': missing frontmatter`);
    }

    const parsed = matter(raw);
    return {
      id,
      title: parsed.data["title"] ?? id,
      content: parsed.content.trim(),
      tags: parsed.data["tags"] ?? [],
      lifecycle: normalizeLifecycle(parsed.data["lifecycle"]),
      project: parsed.data["project"] as string | undefined,
      projectName: parsed.data["projectName"] as string | undefined,
      relatedTo: parsed.data["relatedTo"] as Relationship[] | undefined,
      createdAt: parsed.data["createdAt"] ?? new Date().toISOString(),
      updatedAt: parsed.data["updatedAt"] ?? new Date().toISOString(),
      memoryVersion: normalizeMemoryVersion(parsed.data["memoryVersion"]),
    };
  }
}

function normalizeMemoryVersion(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1) {
    return value;
  }

  return 0;
}

function normalizeLifecycle(value: unknown): NoteLifecycle {
  return value === "temporary" ? "temporary" : "permanent";
}
