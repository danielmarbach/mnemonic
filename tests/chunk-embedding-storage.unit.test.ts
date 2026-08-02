import { afterEach, describe, expect, it } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  ChunkEmbeddingStorage,
  validateChunkEmbeddingRecord,
} from "../src/chunk-embedding-storage.js";
import type { ChunkEmbeddingRecord } from "../src/chunk-embedding-storage.js";
import { xxh128 } from "../src/hashing.js";
import {
  embeddingCompatibilityKey,
  embeddingDimensions,
  embeddingMetric,
  embeddingModelId,
  embeddingProviderId,
  isoDateString,
} from "../src/brands.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function makeStorage(): Promise<{ dir: string; storage: ChunkEmbeddingStorage }> {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "mnemonic-chunk-embedding-"));
  tempDirs.push(base);
  const dir = path.join(base, "att-1");
  const storage = new ChunkEmbeddingStorage(dir, "att-1");
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
    await fs.writeFile(await storage.pathFor(chunkId), "{ not valid json", "utf-8");

    await expect(storage.read(chunkId)).resolves.toBeNull();
    await expect(storage.list()).resolves.toEqual([]);
  });

  it("returns null for a well-formed file with the wrong shape and skips it in list", async () => {
    const { dir, storage } = await makeStorage();
    const chunkId = "att-1::docs/shape.md::Intro::0::0";
    await fs.writeFile(
      await storage.pathFor(chunkId),
      JSON.stringify({ chunkId, embedding: "not-an-array" }),
      "utf-8",
    );

    await expect(storage.read(chunkId)).resolves.toBeNull();
    await expect(storage.list()).resolves.toEqual([]);
  });

  it("returns null for a record whose payload chunkId differs from the requested one", async () => {
    const { storage } = await makeStorage();
    const requestedId = "att-1::docs/requested.md::Intro::0::0";
    const mismatchedId = "att-1::docs/other.md::Intro::0::0";
    // A well-formed record for `mismatchedId` placed at the path for
    // `requestedId` — simulating a corrupt/misplaced file. read must reject it
    // so a caller can't reuse a record keyed under the wrong id.
    await fs.writeFile(
      await storage.pathFor(requestedId),
      JSON.stringify(makeRecord({ chunkId: mismatchedId })),
      "utf-8",
    );

    await expect(storage.read(requestedId)).resolves.toBeNull();
  });

  it("lists only valid records and ignores corrupt siblings", async () => {
    const { dir, storage } = await makeStorage();
    const valid = makeRecord();
    const corruptId = "att-1::docs/corrupt.md::Intro::0::0";
    await storage.write(valid);
    await fs.writeFile(await storage.pathFor(corruptId), "garbage", "utf-8");

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

  it("names files by the xxh128 digest of the chunk-id suffix (attachment id stripped)", async () => {
    const { dir, storage } = await makeStorage();
    const chunkId = "att-1::docs/Guide.md::Setup & Config::0::0";
    await storage.write(makeRecord({ chunkId }));

    // The attachment-id prefix is dropped (the directory already scopes by it)
    // and the remaining suffix is hashed with xxh128 to a fixed 32-hex-char
    // name, so source-path depth and heading-ancestry length can never exceed
    // the filesystem's single-component limit.
    const suffix = "docs/Guide.md::Setup & Config::0::0";
    const expectedFile = path.join(dir, `${await xxh128(suffix)}.json`);
    await expect(fs.access(expectedFile)).resolves.toBeUndefined();
    expect(path.basename(expectedFile)).toMatch(/^[0-9a-f]{32}\.json$/);

    // The authoritative chunkId round-trips intact from the JSON payload.
    const readBack = await storage.read(chunkId);
    expect(readBack?.chunkId).toBe(chunkId);

    // Neither the verbatim chunkId nor an attachment-id-prefixed slug is used.
    await expect(fs.access(path.join(dir, `${chunkId}.json`))).rejects.toThrow();
    await expect(
      fs.access(path.join(dir, "att-1-docs-guide-md-setup-config-0-0.json")),
    ).rejects.toThrow();
  });

  it("reconcile removes stale chunks every call but legacy-named files only when opted in", async () => {
    const { dir, storage } = await makeStorage();
    const currentId = "att-1::docs/keep.md::Intro::0::0";
    const staleId = "att-1::docs/gone.md::Intro::0::0";
    await storage.write(makeRecord({ chunkId: currentId }));
    await storage.write(makeRecord({ chunkId: staleId }));

    // Simulate a pre-rename legacy file: same chunkId as `currentId` but stored
    // at the OLD naming scheme (attachment-id prefix, mixed case). This file is
    // invisible to `list()`/`remove()` (which target the canonical name) yet
    // still carries a valid chunkId, so plain sweep would spare it.
    const legacyPath = path.join(dir, "att-1-docs-keep-md-Intro-0-0.json");
    await fs.writeFile(
      legacyPath,
      JSON.stringify(makeRecord({ chunkId: currentId }), null, 2),
      "utf-8",
    );

    // Default pass: stale removal only; the legacy file is left in place so the
    // per-sync path skips the basename comparison when nothing changed.
    const defaultResult = await storage.reconcile(new Set([currentId]));
    expect(defaultResult.stale).toBe(1);
    expect(defaultResult.nonCanonical).toBe(0);
    await expect(fs.access(legacyPath)).resolves.toBeUndefined();

    // Opt-in pass (schema-version change): now the legacy file is removed too.
    const optInResult = await storage.reconcile(new Set([currentId]), true);
    expect(optInResult.stale).toBe(0);
    expect(optInResult.nonCanonical).toBe(1);
    // The canonical current file survives; the legacy file is gone.
    expect(await storage.list()).toHaveLength(1);
    expect(await storage.read(currentId)).not.toBeNull();
    await expect(fs.access(legacyPath)).rejects.toThrow();
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
