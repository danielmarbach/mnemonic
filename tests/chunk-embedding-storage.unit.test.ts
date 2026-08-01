import { afterEach, describe, expect, it } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  ChunkEmbeddingStorage,
  validateChunkEmbeddingRecord,
} from "../src/chunk-embedding-storage.js";
import type { ChunkEmbeddingRecord } from "../src/chunk-embedding-storage.js";
import {
  embeddingCompatibilityKey,
  embeddingDimensions,
  embeddingMetric,
  embeddingModelId,
  embeddingProviderId,
  isoDateString,
} from "../src/brands.js";
import { normalizePathToSlug } from "../src/retrieval-document.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function makeStorage(): Promise<{ dir: string; storage: ChunkEmbeddingStorage }> {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "mnemonic-chunk-embedding-"));
  tempDirs.push(base);
  const dir = path.join(base, "att-1");
  const storage = new ChunkEmbeddingStorage(dir);
  await storage.init();
  return { dir, storage };
}

/** Deterministic valid record for storage round-trips. */
function makeRecord(overrides: Partial<ChunkEmbeddingRecord> = {}): ChunkEmbeddingRecord {
  return {
    chunkId: "att-1::docs/guide.md::Setup::0::0",
    contentHash: "cafebabe0123",
    model: embeddingModelId("test-model"),
    provider: embeddingProviderId("ollama"),
    dimensions: embeddingDimensions(3),
    metric: embeddingMetric("cosine"),
    compatibilityKey: embeddingCompatibilityKey(
      "provider=ollama|model=test-model|dimensions=3|metric=cosine|inputMode=default",
    ),
    embedding: [1, 2, 3],
    updatedAt: isoDateString("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("ChunkEmbeddingStorage", () => {
  it("round-trips a valid record with all fields preserved", async () => {
    const { storage } = await makeStorage();
    const record = makeRecord();

    await storage.write(record);
    const readBack = await storage.read(record.chunkId);

    expect(readBack).not.toBeNull();
    expect(readBack).toEqual(record);
    expect(readBack?.chunkId).toBe(record.chunkId);
    expect(readBack?.contentHash).toBe(record.contentHash);
    expect(readBack?.embedding).toEqual([1, 2, 3]);
    expect(readBack?.model).toBe("test-model");
    expect(readBack?.updatedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("returns null for a chunk with no persisted record", async () => {
    const { storage } = await makeStorage();

    await expect(storage.read("att-1::docs/missing.md::Intro::0::0")).resolves.toBeNull();
  });

  it("returns null for corrupt JSON and skips it in list", async () => {
    const { dir, storage } = await makeStorage();
    const chunkId = "att-1::docs/corrupt.md::Intro::0::0";
    await fs.writeFile(
      path.join(dir, `${normalizePathToSlug(chunkId)}.json`),
      "{ not valid json",
      "utf-8",
    );

    await expect(storage.read(chunkId)).resolves.toBeNull();
    await expect(storage.list()).resolves.toEqual([]);
  });

  it("returns null for a well-formed file with the wrong shape and skips it in list", async () => {
    const { dir, storage } = await makeStorage();
    const chunkId = "att-1::docs/shape.md::Intro::0::0";
    await fs.writeFile(
      path.join(dir, `${normalizePathToSlug(chunkId)}.json`),
      JSON.stringify({ chunkId, embedding: "not-an-array" }),
      "utf-8",
    );

    await expect(storage.read(chunkId)).resolves.toBeNull();
    await expect(storage.list()).resolves.toEqual([]);
  });

  it("lists only valid records and ignores corrupt siblings", async () => {
    const { dir, storage } = await makeStorage();
    const valid = makeRecord();
    const corruptId = "att-1::docs/corrupt.md::Intro::0::0";
    await storage.write(valid);
    await fs.writeFile(
      path.join(dir, `${normalizePathToSlug(corruptId)}.json`),
      "garbage",
      "utf-8",
    );

    const listed = await storage.list();

    expect(listed).toHaveLength(1);
    expect(listed[0]).toEqual(valid);
  });

  it("remove ignores a missing record without throwing", async () => {
    const { storage } = await makeStorage();

    await expect(
      storage.remove("att-1::docs/never-written.md::Intro::0::0"),
    ).resolves.toBeUndefined();
  });

  it("removeAll deletes the directory and is idempotent on a missing directory", async () => {
    const { dir, storage } = await makeStorage();
    await storage.write(makeRecord());
    expect(await storage.list()).toHaveLength(1);

    await storage.removeAll();

    await expect(fs.readdir(dir)).rejects.toThrow();
    // Idempotent: removing an already-missing directory must not throw.
    await expect(storage.removeAll()).resolves.toBeUndefined();
    await expect(storage.removeAll()).resolves.toBeUndefined();
  });

  it("names files by the slugified chunk id", async () => {
    const { dir, storage } = await makeStorage();
    const chunkId = "att-1::docs/Guide.md::Setup & Config::0::0";
    await storage.write(makeRecord({ chunkId }));

    const expectedFile = path.join(dir, `${normalizePathToSlug(chunkId)}.json`);
    await expect(fs.access(expectedFile)).resolves.toBeUndefined();
    expect(normalizePathToSlug(chunkId)).toBe("att-1-docs-Guide-md-Setup-Config-0-0");
    // The non-slugified chunkId must not be used verbatim as a file name.
    const literalFile = path.join(dir, `${chunkId}.json`);
    await expect(fs.access(literalFile)).rejects.toThrow();
  });
});

describe("validateChunkEmbeddingRecord", () => {
  it("accepts a fully-populated record", () => {
    const record = makeRecord();
    expect(validateChunkEmbeddingRecord(record)).toEqual(record);
  });

  it("accepts a minimal record without optional provider metadata", () => {
    const minimal = makeRecord({
      provider: undefined,
      dimensions: undefined,
      metric: undefined,
      compatibilityKey: undefined,
    });
    const validated = validateChunkEmbeddingRecord(minimal);
    expect(validated).not.toBeNull();
    expect(validated?.provider).toBeUndefined();
    expect(validated?.dimensions).toBeUndefined();
    expect(validated?.metric).toBeUndefined();
    expect(validated?.compatibilityKey).toBeUndefined();
  });

  it("rejects non-record values", () => {
    expect(validateChunkEmbeddingRecord(null)).toBeNull();
    expect(validateChunkEmbeddingRecord("nope")).toBeNull();
    expect(validateChunkEmbeddingRecord([1, 2, 3])).toBeNull();
  });

  it("rejects an invalid updatedAt date", () => {
    expect(
      validateChunkEmbeddingRecord(makeRecord({ updatedAt: isoDateString("not-a-date") })),
    ).toBeNull();
  });
});
