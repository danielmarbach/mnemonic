import fs from "fs/promises";
import path from "path";
import matter from "gray-matter";

export type RelationshipType = "related-to" | "explains" | "example-of" | "supersedes";

export interface Relationship {
  id: string;
  type: RelationshipType;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  /** Stable project identifier, or undefined for global memories */
  project?: string;
  /** Human-readable project name for display */
  projectName?: string;
  relatedTo?: Relationship[];
  createdAt: string;
  updatedAt: string;
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

  async writeNote(note: Note): Promise<void> {
    const frontmatter: Record<string, unknown> = {
      title: note.title,
      tags: note.tags,
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
    const fileContent = matter.stringify(note.content, frontmatter);
    await fs.writeFile(this.notePath(note.id), fileContent, "utf-8");
  }

  async readNote(id: string): Promise<Note | null> {
    try {
      const raw = await fs.readFile(this.notePath(id), "utf-8");
      return this.parseNote(id, raw);
    } catch {
      return null;
    }
  }

  async deleteNote(id: string): Promise<boolean> {
    try {
      await fs.unlink(this.notePath(id));
      try { await fs.unlink(this.embeddingPath(id)); } catch { /* ok */ }
      return true;
    } catch {
      return false;
    }
  }

  async listNotes(filter?: { project?: string | null }): Promise<Note[]> {
    let files: string[];
    try {
      files = await fs.readdir(this.notesDir);
    } catch {
      return [];
    }

    const notes: Note[] = [];
    for (const file of files) {
      if (!file.endsWith(".md")) continue;
      const id = file.replace(/\.md$/, "");
      const note = await this.readNote(id);
      if (!note) continue;

      if (filter !== undefined) {
        if (filter.project === null) {
          // Only global notes
          if (note.project) continue;
        } else if (filter.project !== undefined) {
          // Only notes matching this project
          if (note.project !== filter.project) continue;
        }
      }

      notes.push(note);
    }
    return notes;
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

  private parseNote(id: string, raw: string): Note {
    const parsed = matter(raw);
    return {
      id,
      title: parsed.data["title"] ?? id,
      content: parsed.content.trim(),
      tags: parsed.data["tags"] ?? [],
      project: parsed.data["project"] as string | undefined,
      projectName: parsed.data["projectName"] as string | undefined,
      relatedTo: parsed.data["relatedTo"] as Relationship[] | undefined,
      createdAt: parsed.data["createdAt"] ?? new Date().toISOString(),
      updatedAt: parsed.data["updatedAt"] ?? new Date().toISOString(),
    };
  }
}
