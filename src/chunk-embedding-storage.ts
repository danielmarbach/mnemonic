import { promises as fs } from "fs";
import path from "path";
import type {
  EmbeddingCompatibilityKey,
  EmbeddingDimensions,
  EmbeddingMetric,
  EmbeddingModelId,
  EmbeddingProviderId,
  ISO8601DateString,
} from "./brands.js";
import {
  embeddingCompatibilityKey,
  embeddingDimensions,
  embeddingMetric,
  embeddingModelId,
  embeddingProviderId,
  isValidIsoDateString,
} from "./brands.js";
import { attempt } from "./error-utils.js";
import { xxh128 } from "./hashing.js";

/**
 * A persisted embedding record for a single retrieval chunk.
 *
 * Keyed by the plain-string form of a `ChunkId`. Chunk IDs are NOT `MemoryId`s
 * (they are derived from attachment + document path + heading ancestry), so
 * they deliberately reuse no branding from the note-embedding storage path.
 */
export interface ChunkEmbeddingRecord {
  chunkId: string; // the ChunkId (branded string) serialized as plain string
  contentHash: string; // 32-hex-char xxh128 of the chunk's projection text (set by Stage 2)
  model: EmbeddingModelId;
  provider?: EmbeddingProviderId;
  dimensions?: EmbeddingDimensions;
  metric?: EmbeddingMetric;
  compatibilityKey?: EmbeddingCompatibilityKey;
  embedding: number[];
  updatedAt: ISO8601DateString;
}

/**
 * File-backed storage for chunk embeddings.
 *
 * Owns a single directory (the per-attachment directory resolved by the caller,
 * e.g. `.mnemonic/embeddings/doc-source/<attachmentId>/`). Files are named by
 * the xxh128 digest of the chunk-id *suffix* — the leading `<attachmentId>::`
 * prefix is stripped first because the directory already scopes by attachment
 * id, so it would be redundant in the hash input: `<xxh128(suffix)>.json`
 * (32 lowercase hex chars, fixed length regardless of source-path depth or
 * heading ancestry).
 *
 * xxh128 (XXH3-128, non-cryptographic) bounds the filename to a fixed length so
 * document sources with arbitrarily deep paths and long heading ancestry never
 * hit the 255-byte single-component limit shared by APFS/ext4/NTFS — a problem
 * unique to document sources, since note-embedding files are named by short
 * GUIDs. 128 bits removes any practical collision concern at the
 * document-source scale (`maxTotalChunks` = 50 000). The authoritative
 * `::`-separated chunkId lives inside the JSON payload and is never derived
 * from or altered by the filename; retrieval keys on that id, not the file
 * name. `pathFor` is async because hash-wasm lazily compiles its WASM on first
 * use. See the `document-source-chunk-embeddings-use-xxh128-...` decision note.
 */
export class ChunkEmbeddingStorage {
  constructor(
    private readonly dir: string,
    private readonly attachmentId: string,
  ) {}

  async init(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
  }

  async pathFor(chunkId: string): Promise<string> {
    const prefix = `${this.attachmentId}::`;
    const suffix = chunkId.startsWith(prefix) ? chunkId.slice(prefix.length) : chunkId;
    return path.join(this.dir, (await xxh128(suffix)) + ".json");
  }

  async read(chunkId: string): Promise<ChunkEmbeddingRecord | null> {
    const filePath = await this.pathFor(chunkId);
    const raw = await attempt("chunk-embedding:read", () => fs.readFile(filePath, "utf-8"));
    if (!raw.ok) return null;
    const parsed = await attempt("chunk-embedding:read", (): unknown => JSON.parse(raw.value));
    if (!parsed.ok) return null;
    const record = validateChunkEmbeddingRecord(parsed.value);
    // A canonical file lives at pathFor(chunkId) and carries that same chunkId
    // in its payload. A mismatch means the file is corrupt or misplaced; treat
    // it as unreadable so callers re-embed rather than reuse a record keyed
    // under the wrong id.
    return record && record.chunkId === chunkId ? record : null;
  }

  async write(record: ChunkEmbeddingRecord): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    const filePath = await this.pathFor(record.chunkId);
    await fs.writeFile(filePath, JSON.stringify(record, null, 2), "utf-8");
  }

  async list(): Promise<ChunkEmbeddingRecord[]> {
    const filesResult = await attempt(
      "chunk-embedding:list",
      () => fs.readdir(this.dir),
      [] as string[],
    );
    const files = filesResult.ok ? filesResult.value : [];
    // Read files directly rather than round-tripping the basename through
    // read()/pathFor(). The old slug scheme was idempotent (slug(slug(x)) ===
    // slug(x)), so the round-trip worked by coincidence; the xxh128 name is NOT
    // idempotent (hash(hash(x)) !== hash(x)), so pathFor(basename) would
    // re-hash the hex and miss every file. Mirrors reconcile()'s direct read.
    const records = await Promise.all(
      files
        .filter((file) => file.endsWith(".json"))
        .map(async (file) => {
          const raw = await attempt("chunk-embedding:list", () =>
            fs.readFile(path.join(this.dir, file), "utf-8"),
          );
          if (!raw.ok) return null;
          const parsed = await attempt("chunk-embedding:list", (): unknown =>
            JSON.parse(raw.value),
          );
          if (!parsed.ok) return null;
          return validateChunkEmbeddingRecord(parsed.value);
        }),
    );
    return records.filter((record): record is ChunkEmbeddingRecord => record !== null);
  }

  async remove(chunkId: string): Promise<void> {
    const filePath = await this.pathFor(chunkId);
    await attempt("chunk-embedding:remove", () => fs.unlink(filePath));
  }

  async removeAll(): Promise<void> {
    await attempt("chunk-embedding:removeAll", () =>
      fs.rm(this.dir, { recursive: true, force: true }),
    );
  }

  /**
   * Reconcile on-disk files against the current generation in a single pass,
   * unlinking by the ACTUAL on-disk path.
   *
   * Stale removal runs every call: a file whose `chunkId` is no longer in
   * `currentChunkIds` is deleted. Rename removal is opt-in via
   * `removeNonCanonical` — pass it only when the caller knows the on-disk
   * naming scheme changed (e.g. an `indexSchemaVersion` bump that dropped the
   * attachment-id prefix or lowercased the slug), so the normal per-sync pass
   * skips the basename comparison when there is nothing to migrate.
   *
   * The rename case is unreachable for `remove()`/`list()` alone: `remove`
   * targets the canonical name, and `list()` discards the real filename — so a
   * legacy-named file whose chunkId is still current is invisible to a plain
   * stale sweep and would accumulate as dead weight after a rename. Fail-soft:
   * unreadable or corrupt files are left in place, mirroring `list()`. Returns
   * the counts removed by reason.
   */
  async reconcile(
    currentChunkIds: Set<string>,
    removeNonCanonical = false,
  ): Promise<{ stale: number; nonCanonical: number }> {
    const filesResult = await attempt(
      "chunk-embedding:reconcile",
      () => fs.readdir(this.dir),
      [] as string[],
    );
    const files = filesResult.ok ? filesResult.value : [];
    let stale = 0;
    let nonCanonical = 0;
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const filePath = path.join(this.dir, file);
      const raw = await attempt("chunk-embedding:reconcile", () => fs.readFile(filePath, "utf-8"));
      if (!raw.ok) continue;
      const parsed = await attempt("chunk-embedding:reconcile", (): unknown =>
        JSON.parse(raw.value),
      );
      if (!parsed.ok) continue;
      const record = validateChunkEmbeddingRecord(parsed.value);
      if (!record) continue;
      if (!currentChunkIds.has(record.chunkId)) {
        const r = await attempt("chunk-embedding:reconcile", () => fs.unlink(filePath));
        if (r.ok) stale++;
        continue;
      }
      if (removeNonCanonical && path.basename(await this.pathFor(record.chunkId)) !== file) {
        const r = await attempt("chunk-embedding:reconcile", () => fs.unlink(filePath));
        if (r.ok) nonCanonical++;
      }
    }
    return { stale, nonCanonical };
  }
}

/**
 * Validate an unknown value as a `ChunkEmbeddingRecord`. Returns null on any
 * shape mismatch so callers can fail-soft when a file is missing or corrupt.
 */
export function validateChunkEmbeddingRecord(value: unknown): ChunkEmbeddingRecord | null {
  if (!isRecord(value)) return null;

  const chunkId = asString(value["chunkId"]);
  const contentHash = asString(value["contentHash"]);
  const model = asString(value["model"]);
  const updatedAt = asString(value["updatedAt"]);
  const embedding = asNumberArray(value["embedding"]);
  if (
    chunkId === null ||
    contentHash === null ||
    model === null ||
    updatedAt === null ||
    embedding === null
  ) {
    return null;
  }
  if (!isValidIsoDateString(updatedAt)) return null;

  const provider = asString(value["provider"]);
  const dimensions = asPositiveInteger(value["dimensions"]);
  const metric = asString(value["metric"]);
  const compatibilityKey = asString(value["compatibilityKey"]);

  return {
    chunkId,
    contentHash,
    model: embeddingModelId(model),
    provider: provider !== null ? embeddingProviderId(provider) : undefined,
    dimensions: dimensions !== null ? embeddingDimensions(dimensions) : undefined,
    metric: metric !== null ? embeddingMetric(metric) : undefined,
    compatibilityKey:
      compatibilityKey !== null ? embeddingCompatibilityKey(compatibilityKey) : undefined,
    embedding,
    updatedAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asPositiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function asNumberArray(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  for (const item of value) {
    if (typeof item !== "number" || !Number.isFinite(item)) return null;
  }
  return value;
}
