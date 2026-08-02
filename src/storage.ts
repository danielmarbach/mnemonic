import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import matter from "gray-matter";
import type { NoteProjection } from "./structured-content.js";
import {
  validateEmbeddingRecord,
  validateNoteProjection,
  validateRelatedTo,
} from "./validation.js";
import type {
  EmbeddingCompatibilityKey,
  EmbeddingDimensions,
  EmbeddingMetric,
  EmbeddingModelId,
  EmbeddingProviderId,
  ISO8601DateString,
  MemoryId,
} from "./brands.js";
import { memoryId, isoDateString, isValidMemoryId } from "./brands.js";
import { attempt } from "./error-utils.js";
import {
  AtomicWriteInProgressError,
  MalformedNoteError,
  InvalidNoteIdError,
} from "./domain-errors.js";

export const RELATIONSHIP_TYPES = [
  "related-to",
  "explains",
  "example-of",
  "supersedes",
  "derives-from",
  "follows",
] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];
export type NoteLifecycle = "temporary" | "permanent";
export type NoteRole =
  "summary" | "decision" | "plan" | "context" | "reference" | "research" | "review";
export type NoteImportance = "high" | "normal" | "low";
export const NOTE_LIFECYCLES = [
  "temporary",
  "permanent",
] as const satisfies readonly NoteLifecycle[];
export const NOTE_ROLES = [
  "summary",
  "decision",
  "plan",
  "context",
  "reference",
  "research",
  "review",
] as const satisfies readonly NoteRole[];
export const NOTE_IMPORTANCE_LEVELS = [
  "high",
  "normal",
  "low",
] as const satisfies readonly NoteImportance[];

export interface Relationship {
  id: MemoryId;
  type: RelationshipType;
  vaultPath?: string;
}

/**
 * Frontmatter metadata of a note — the `content` field is intentionally absent.
 *
 * Metadata-only notes (from `readNoteMetadata` / `listNotesMetadata`) carry no
 * body at all, so accidental `.content` access is a compile error and
 * `hasNoteContent` can reliably distinguish them from full notes.
 */
export interface NoteMetadata {
  id: MemoryId;
  title: string;
  tags: string[];
  lifecycle: NoteLifecycle;
  role?: NoteRole;
  importance?: NoteImportance;
  alwaysLoad?: boolean;
  /** Stable project identifier, or undefined for global memories */
  project?: string;
  /** Human-readable project name for display */
  projectName?: string;
  relatedTo?: Relationship[];
  createdAt: ISO8601DateString;
  updatedAt: ISO8601DateString;
  /** Schema version for forward compatibility (0 = pre-v0.2.0) */
  memoryVersion?: number;
}

/** Full note — metadata plus body content. */
export interface Note extends NoteMetadata {
  content: string;
}

/**
 * Narrow a possibly metadata-only note to a full note.
 *
 * Full notes (from `readNote` / `listNotes`) carry a `content` property;
 * metadata-only notes (from `readNoteMetadata` / `listNotesMetadata`) have no
 * `content` property at all. Use this guard before accessing `.content` on a
 * `NoteMetadata`.
 */
export function hasNoteContent(note: NoteMetadata): note is Note {
  return "content" in note;
}

/** Maximum number of file descriptors opened at once during bulk listings. */
const LIST_CONCURRENCY = 32;

/**
 * Map over an array with a bounded number of concurrent async operations while
 * preserving input order in the result (each result is placed at its source
 * index). Used by bulk listings so we never open a descriptor for every note or
 * embedding at once when a vault grows large.
 */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let next = 0;
  const workerCount = Math.min(concurrency, items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      const item = items[index];
      if (item === undefined) return;
      results[index] = await fn(item, index);
    }
  });
  await Promise.all(workers);
  return results;
}

export interface EmbeddingRecord {
  id: MemoryId;
  model: EmbeddingModelId;
  provider?: EmbeddingProviderId;
  dimensions?: EmbeddingDimensions;
  metric?: EmbeddingMetric;
  inputMode?: string;
  compatibilityKey?: EmbeddingCompatibilityKey;
  embedding: number[];
  updatedAt: ISO8601DateString;
}

export interface NoteStorage {
  readonly vaultPath: string;
  readonly notesDir: string;
  readonly embeddingsDir: string;
  readonly projectionsDir: string;
  init(): Promise<void>;
  listNoteIds(): Promise<MemoryId[]>;
  readNote(id: MemoryId): Promise<Note | null>;
  /** Read only the frontmatter metadata of a note (no content field). */
  readNoteMetadata(id: MemoryId): Promise<NoteMetadata | null>;
  listNotes(filter?: { project?: string | null }): Promise<Note[]>;
  /** Bulk list of frontmatter metadata only — no content field. */
  listNotesMetadata(filter?: { project?: string | null }): Promise<NoteMetadata[]>;
  writeNote(note: Note): Promise<void>;
  deleteNote(id: MemoryId): Promise<boolean>;
  beginAtomicNotesWrite(): Promise<void>;
  commitAtomicNotesWrite(): Promise<void>;
  rollbackAtomicNotesWrite(): Promise<void>;
  readEmbedding(id: MemoryId): Promise<EmbeddingRecord | null>;
  writeEmbedding(record: EmbeddingRecord): Promise<void>;
  listEmbeddings(): Promise<EmbeddingRecord[]>;
  readProjection(id: MemoryId): Promise<NoteProjection | null>;
  writeProjection(projection: NoteProjection): Promise<void>;
  notePath(id: MemoryId): string;
  embeddingPath(id: MemoryId): string;
  projectionPath(id: MemoryId): string;
}

export class Storage implements NoteStorage {
  readonly vaultPath: string;
  readonly notesDir: string;
  readonly embeddingsDir: string;
  readonly projectionsDir: string;
  private stagedNotesDir?: string;
  private stagedDeletedNoteIds = new Set<string>();

  /**
   * @param vaultPath - Absolute path to the vault directory.
   * @param embeddingsDirOverride - Optional override for the embeddings directory.
   *   Used by submodule vaults to share the primary project vault's embeddings directory
   *   so that all embeddings for a project (including submodule notes) live in one place.
   */
  constructor(vaultPath: string, embeddingsDirOverride?: string) {
    this.vaultPath = path.resolve(vaultPath);
    this.notesDir = path.join(this.vaultPath, "notes");
    // Embeddings are local-only — kept outside the synced notes tree.
    // Submodule vaults may redirect embeddings to the primary project vault's directory.
    this.embeddingsDir = embeddingsDirOverride
      ? path.resolve(embeddingsDirOverride)
      : path.join(this.vaultPath, "embeddings");
    // Projections are local-only derived artifacts, colocated with embeddings.
    this.projectionsDir = path.join(this.vaultPath, "projections");
  }

  async init(): Promise<void> {
    await fs.mkdir(this.notesDir, { recursive: true });
    await fs.mkdir(this.embeddingsDir, { recursive: true });
    await fs.mkdir(this.projectionsDir, { recursive: true });
  }

  // ── Notes ──────────────────────────────────────────────────────────────────

  async beginAtomicNotesWrite(): Promise<void> {
    if (this.stagedNotesDir) {
      throw new AtomicWriteInProgressError();
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

    const mdFiles = stagedFiles.filter((f) => f.endsWith(".md"));
    await Promise.all(
      mdFiles.map((file) => fs.rename(path.join(stagedDir, file), path.join(this.notesDir, file))),
    );

    await Promise.allSettled(
      [...this.stagedDeletedNoteIds].map((noteId) => fs.unlink(this.notePath(memoryId(noteId)))),
    );

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

  async readNote(id: MemoryId): Promise<Note | null> {
    if (this.stagedDeletedNoteIds.has(id)) {
      return null;
    }

    const stagedPath = this.stagedNotePath(id);
    if (stagedPath) {
      const result = await attempt("storage:readNote", async () => {
        const raw = await fs.readFile(stagedPath, "utf-8");
        return this.parseNote(id, raw);
      });
      if (result.ok) return result.value;
    }

    const result = await attempt("storage:readNote", async () => {
      const raw = await fs.readFile(this.notePath(id), "utf-8");
      return this.parseNote(id, raw);
    });
    return result.ok ? result.value : null;
  }

  async readNoteMetadata(id: MemoryId): Promise<NoteMetadata | null> {
    if (this.stagedDeletedNoteIds.has(id)) return null;

    const stagedPath = this.stagedNotePath(id);
    if (stagedPath) {
      const stagedResult = await attempt("storage:readNoteMetadata", async () => {
        const raw = await readFrontmatter(stagedPath);
        return toNoteMetadata(this.parseNote(id, raw));
      });
      if (stagedResult.ok) return stagedResult.value;
    }

    const result = await attempt("storage:readNoteMetadata", async () => {
      const raw = await readFrontmatter(this.notePath(id));
      return toNoteMetadata(this.parseNote(id, raw));
    });
    return result.ok ? result.value : null;
  }

  async deleteNote(id: MemoryId): Promise<boolean> {
    if (this.stagedNotesDir) {
      this.stagedDeletedNoteIds.add(id);
      const stagedPath = this.stagedNotePath(id);
      if (stagedPath) {
        await attempt("storage:deleteStaged", () => fs.unlink(stagedPath));
      }
      return true;
    }

    const [noteResult] = await Promise.allSettled([
      fs.unlink(this.notePath(id)),
      fs.unlink(this.embeddingPath(id)),
      fs.unlink(this.projectionPath(id)),
    ]);
    return noteResult.status === "fulfilled";
  }

  async listNotes(filter?: { project?: string | null }): Promise<Note[]> {
    const ids = await this.listNoteIds();
    const readNotes = await mapWithConcurrency(ids, LIST_CONCURRENCY, async (id) => ({
      id,
      note: await this.readNote(id),
    }));
    const notes: Note[] = [];

    for (const { note } of readNotes) {
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

  /**
   * Metadata-only bulk listing: each note is read through `readNoteMetadata`
   * (bounded frontmatter read) and carries no `content` field at all.
   */
  async listNotesMetadata(filter?: { project?: string | null }): Promise<NoteMetadata[]> {
    const ids = await this.listNoteIds();
    const readNotes = await mapWithConcurrency(ids, LIST_CONCURRENCY, async (id) => ({
      id,
      note: await this.readNoteMetadata(id),
    }));
    const notes: NoteMetadata[] = [];

    for (const { note } of readNotes) {
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
    if (isNoteRole(note.role)) {
      frontmatter["role"] = note.role;
    }
    if (isNoteImportance(note.importance)) {
      frontmatter["importance"] = note.importance;
    }
    if (typeof note.alwaysLoad === "boolean") {
      frontmatter["alwaysLoad"] = note.alwaysLoad;
    }
    if (note.project) {
      frontmatter["project"] = note.project;
      if (note.projectName) frontmatter["projectName"] = note.projectName;
    }
    if (note.relatedTo && note.relatedTo.length > 0) {
      frontmatter["relatedTo"] = note.relatedTo;
    }
    if (note.memoryVersion !== undefined && note.memoryVersion > 0) {
      frontmatter["memoryVersion"] = note.memoryVersion;
    }
    return matter.stringify(note.content, frontmatter);
  }

  // ── Embeddings ─────────────────────────────────────────────────────────────

  async writeEmbedding(record: EmbeddingRecord): Promise<void> {
    await fs.writeFile(this.embeddingPath(record.id), JSON.stringify(record, null, 2), "utf-8");
  }

  async readEmbedding(id: MemoryId): Promise<EmbeddingRecord | null> {
    const raw = await attempt("storage:readEmbedding", () =>
      fs.readFile(this.embeddingPath(id), "utf-8"),
    );
    if (!raw.ok) return null;
    const parsed = await attempt("storage:readEmbedding", () => JSON.parse(raw.value));
    if (!parsed.ok) return null;
    return validateEmbeddingRecord(parsed.value);
  }

  async listEmbeddings(): Promise<EmbeddingRecord[]> {
    const filesResult = await attempt(
      "storage:listEmbeddings",
      () => fs.readdir(this.embeddingsDir),
      [] as string[],
    );
    // Sort filenames so the embedding order is deterministic and
    // filesystem-independent; `readdir` alone preserves directory order, which
    // is not guaranteed across platforms. Concurrency below preserves this
    // input order, so sorting here keeps `listEmbeddings` stable.
    const files = (filesResult.ok ? filesResult.value : []).sort();
    const ids = files
      .filter((file) => file.endsWith(".json"))
      .map((file) => memoryId(file.replace(/\.json$/, "")));
    const records = await mapWithConcurrency(ids, LIST_CONCURRENCY, (id) => this.readEmbedding(id));
    return records.filter((record): record is EmbeddingRecord => record !== null);
  }

  // ── Projections ────────────────────────────────────────────────────────────

  async writeProjection(projection: NoteProjection): Promise<void> {
    await fs.mkdir(this.projectionsDir, { recursive: true });
    await fs.writeFile(
      this.projectionPath(memoryId(projection.noteId)),
      JSON.stringify(projection, null, 2),
      "utf-8",
    );
  }

  async readProjection(id: MemoryId): Promise<NoteProjection | null> {
    const raw = await attempt("storage:readProjection", () =>
      fs.readFile(this.projectionPath(id), "utf-8"),
    );
    if (!raw.ok) return null;
    const parsed = await attempt("storage:readProjection", () => JSON.parse(raw.value));
    if (!parsed.ok) return null;
    return validateNoteProjection(parsed.value);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  notePath(id: MemoryId): string {
    validateNoteId(id);
    return path.join(this.notesDir, `${id}.md`);
  }

  embeddingPath(id: MemoryId): string {
    validateNoteId(id);
    return path.join(this.embeddingsDir, `${id}.json`);
  }

  projectionPath(id: MemoryId): string {
    validateNoteId(id);
    return path.join(this.projectionsDir, `${id}.json`);
  }

  private stagedNotePath(id: MemoryId): string | undefined {
    validateNoteId(id);
    return this.stagedNotesDir ? path.join(this.stagedNotesDir, `${id}.md`) : undefined;
  }

  async listNoteIds(): Promise<MemoryId[]> {
    const ids = new Set<string>();

    const filesResult = await attempt(
      "storage:listNoteIds",
      () => fs.readdir(this.notesDir),
      [] as string[],
    );
    const files = filesResult.ok ? filesResult.value : [];
    for (const file of files) {
      if (file.endsWith(".md")) {
        ids.add(file.replace(/\.md$/, ""));
      }
    }

    if (this.stagedNotesDir) {
      const stagedDir = this.stagedNotesDir;
      const stagedResult = await attempt(
        "storage:listStagedNoteIds",
        () => fs.readdir(stagedDir),
        [] as string[],
      );
      const stagedFiles = stagedResult.ok ? stagedResult.value : [];
      for (const file of stagedFiles) {
        if (file.endsWith(".md")) {
          ids.add(file.replace(/\.md$/, ""));
        }
      }
    }

    for (const deletedId of this.stagedDeletedNoteIds) {
      ids.delete(deletedId);
    }

    return [...ids].sort().map(memoryId);
  }

  private async clearAtomicNotesWrite(): Promise<void> {
    const stagedDir = this.stagedNotesDir;
    this.stagedNotesDir = undefined;
    this.stagedDeletedNoteIds.clear();

    if (stagedDir) {
      await fs.rm(stagedDir, { recursive: true, force: true });
    }
  }

  parseNote(id: MemoryId, raw: string): Note {
    if (!raw.trimStart().startsWith("---")) {
      throw new MalformedNoteError(id);
    }

    const parsed = matter(raw);
    return {
      id,
      title: parsed.data["title"] ?? id,
      content: parsed.content.trim(),
      tags: parsed.data["tags"] ?? [],
      lifecycle: normalizeLifecycle(parsed.data["lifecycle"]),
      role: normalizeRole(parsed.data["role"]),
      importance: normalizeImportance(parsed.data["importance"]),
      alwaysLoad: normalizeAlwaysLoad(parsed.data["alwaysLoad"]),
      project: typeof parsed.data["project"] === "string" ? parsed.data["project"] : undefined,
      projectName:
        typeof parsed.data["projectName"] === "string" ? parsed.data["projectName"] : undefined,
      relatedTo: validateRelatedTo(parsed.data["relatedTo"]),
      createdAt: toIsoString(parsed.data["createdAt"]),
      updatedAt: toIsoString(parsed.data["updatedAt"]),
      memoryVersion: normalizeMemoryVersion(parsed.data["memoryVersion"]),
    };
  }
}

const INITIAL_FRONTMATTER_WINDOW_BYTES = 1024;
const MAX_FRONTMATTER_WINDOW_BYTES = 16_384;
const FULL_READ_CHUNK_BYTES = 64 * 1024;

/**
 * Strip the body from a parsed note so the metadata-only contract holds at the
 * value level too: metadata notes have no `content` property at all, which lets
 * `hasNoteContent` reliably distinguish them from full notes.
 */
function toNoteMetadata(note: Note): NoteMetadata {
  const { content: _content, ...metadata } = note;
  return metadata;
}

/**
 * Read only enough of a note file to extract frontmatter metadata.
 *
 * Starts with a small initial window (1KB) that covers virtually all realistic
 * frontmatter, then grows incrementally (doubling) until the closing `---`
 * delimiter is found, capped at a bounded metadata window (16KB). If the
 * closing delimiter is still not found at the cap (unusually long frontmatter),
 * falls back to reading the rest of the file so parsing stays correct.
 *
 * All reads accumulate into a single byte buffer that is decoded only once at
 * the end, so a multibyte UTF-8 character split across a read boundary is never
 * corrupted — the delimiter scan works on the raw bytes, and the intermediate
 * decodes are used only for delimiter detection, never for the returned text.
 */
async function readFrontmatter(filePath: string): Promise<string> {
  const fh = await fs.open(filePath, "r");
  return (async () => {
    const chunks: Buffer[] = [];
    let position = 0;

    const readChunk = async (length: number): Promise<number> => {
      const chunk = Buffer.alloc(length);
      const { bytesRead } = await fh.read(chunk, 0, length, position);
      position += bytesRead;
      chunks.push(chunk.subarray(0, bytesRead));
      return bytesRead;
    };

    let bytesRead = await readChunk(INITIAL_FRONTMATTER_WINDOW_BYTES);
    if (bytesRead === 0) return "";

    // Only grow when the initial window looks like it holds unclosed frontmatter.
    if (hasUnclosedFrontmatter(Buffer.concat(chunks))) {
      while (position < MAX_FRONTMATTER_WINDOW_BYTES) {
        const target = Math.min(position * 2, MAX_FRONTMATTER_WINDOW_BYTES);
        bytesRead = await readChunk(target - position);
        if (bytesRead === 0) break; // EOF — delimiter never closed
        if (!hasUnclosedFrontmatter(Buffer.concat(chunks))) {
          return Buffer.concat(chunks).toString("utf-8");
        }
      }

      // Frontmatter didn't close within the bounded window — read the rest in
      // bounded chunks until EOF so parsing stays correct for large notes.
      while (true) {
        const chunk = Buffer.alloc(FULL_READ_CHUNK_BYTES);
        const { bytesRead: more } = await fh.read(chunk, 0, chunk.length, position);
        if (more === 0) break;
        position += more;
        chunks.push(chunk.subarray(0, more));
      }
    }
    return Buffer.concat(chunks).toString("utf-8");
  })().finally(() => fh.close());
}

/**
 * A note has unclosed frontmatter when it starts with `---` but the closing
 * `\n---` delimiter has not yet appeared in the bytes read so far.
 */
function hasUnclosedFrontmatter(buffer: Buffer): boolean {
  const text = buffer.toString("utf-8");
  const trimmed = text.trimStart();
  if (!trimmed.startsWith("---")) return false;
  const afterFirst = trimmed.slice(3);
  return afterFirst.indexOf("\n---") === -1;
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

function normalizeRole(value: unknown): NoteRole | undefined {
  return isNoteRole(value) ? value : undefined;
}

function normalizeImportance(value: unknown): NoteImportance | undefined {
  return isNoteImportance(value) ? value : undefined;
}

function normalizeAlwaysLoad(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function isNoteRole(value: unknown): value is NoteRole {
  return typeof value === "string" && NOTE_ROLES.includes(value as NoteRole);
}

function isNoteImportance(value: unknown): value is NoteImportance {
  return typeof value === "string" && NOTE_IMPORTANCE_LEVELS.includes(value as NoteImportance);
}

function validateNoteId(id: string): void {
  if (!isValidMemoryId(id)) {
    throw new InvalidNoteIdError(id);
  }
}

function toIsoString(value: unknown): ISO8601DateString {
  if (value instanceof Date) return isoDateString(value.toISOString());
  if (typeof value === "string" && value) return isoDateString(value);
  return isoDateString(new Date().toISOString());
}
