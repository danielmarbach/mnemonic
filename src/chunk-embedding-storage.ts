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
import { normalizePathToSlug } from "./retrieval-document.js";

/**
 * A persisted embedding record for a single retrieval chunk.
 *
 * Keyed by the plain-string form of a `ChunkId`. Chunk IDs are NOT `MemoryId`s
 * (they are derived from attachment + document path + heading ancestry), so
 * they deliberately reuse no branding from the note-embedding storage path.
 */
export interface ChunkEmbeddingRecord {
  chunkId: string; // the ChunkId (branded string) serialized as plain string
  contentHash: string; // hex sha256 of the chunk's projection text (set by Stage 2)
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
 * the slugified chunk ID: `<slug(chunkId)>.json`.
 */
export class ChunkEmbeddingStorage {
  constructor(private readonly dir: string) {}

  async init(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
  }

  private pathFor(chunkId: string): string {
    return path.join(this.dir, normalizePathToSlug(chunkId) + ".json");
  }

  async read(chunkId: string): Promise<ChunkEmbeddingRecord | null> {
    const raw = await attempt("chunk-embedding:read", () =>
      fs.readFile(this.pathFor(chunkId), "utf-8"),
    );
    if (!raw.ok) return null;
    const parsed = await attempt("chunk-embedding:read", (): unknown => JSON.parse(raw.value));
    if (!parsed.ok) return null;
    return validateChunkEmbeddingRecord(parsed.value);
  }

  async write(record: ChunkEmbeddingRecord): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(this.pathFor(record.chunkId), JSON.stringify(record, null, 2), "utf-8");
  }

  async list(): Promise<ChunkEmbeddingRecord[]> {
    const filesResult = await attempt(
      "chunk-embedding:list",
      () => fs.readdir(this.dir),
      [] as string[],
    );
    const files = filesResult.ok ? filesResult.value : [];
    const chunkIds = files
      .filter((file) => file.endsWith(".json"))
      .map((file) => file.replace(/\.json$/, ""));
    const records = await Promise.all(chunkIds.map((id) => this.read(id)));
    return records.filter((record): record is ChunkEmbeddingRecord => record !== null);
  }

  async remove(chunkId: string): Promise<void> {
    await attempt("chunk-embedding:remove", () => fs.unlink(this.pathFor(chunkId)));
  }

  async removeAll(): Promise<void> {
    await attempt("chunk-embedding:removeAll", () =>
      fs.rm(this.dir, { recursive: true, force: true }),
    );
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
