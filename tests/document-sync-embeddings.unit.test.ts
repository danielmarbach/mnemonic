import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  embedGenerationChunks,
  isGenerationCurrent,
  sweepStaleChunkEmbeddings,
} from "../src/document-sync.js";
import { ChunkEmbeddingStorage } from "../src/chunk-embedding-storage.js";
import type { ChunkEmbeddingRecord } from "../src/chunk-embedding-storage.js";
import { buildGenerationFromFiles } from "../src/document-source-index.js";
import { clearAllGenerations, getCurrentGeneration } from "../src/generation-storage.js";
import { markdownChunker } from "../src/markdown-chunker.js";
import { markdownExtractor } from "../src/markdown-extractor.js";
import type { DocumentGeneration } from "../src/retrieval-document.js";
import {
  embeddingCompatibilityKey,
  embeddingDimensions,
  embeddingMetric,
  embeddingModelId,
  embeddingProviderId,
  isoDateString,
} from "../src/brands.js";
import type { ServerContext } from "../src/server-context.js";
import type { EmbeddingRecord } from "../src/storage.js";
import type { EmbeddingIdentity } from "../src/embeddings.js";
import type {
  EmbeddingCompatibilityKey,
  EmbeddingDimensions,
  EmbeddingMetric,
  EmbeddingModelId,
  EmbeddingProviderId,
} from "../src/brands.js";

const { embedMock, mockIdentity } = vi.hoisted(() => {
  const embedMock = vi.fn<(text: string) => Promise<number[]>>();
  const mockIdentity: EmbeddingIdentity = {
    provider: "ollama" as EmbeddingProviderId,
    model: "test-model" as EmbeddingModelId,
    dimensions: 8 as EmbeddingDimensions,
    metric: "cosine" as EmbeddingMetric,
    compatibilityKey: "test-model" as EmbeddingCompatibilityKey,
  };
  return { embedMock, mockIdentity };
});

vi.mock("../src/embeddings.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/embeddings.js")>();
  return {
    ...actual,
    embed: embedMock,
    currentEmbeddingIdentity: mockIdentity,
    embeddingMetadata: (
      vector: number[],
      identity: EmbeddingIdentity = mockIdentity,
    ): Pick<
      EmbeddingRecord,
      "model" | "provider" | "dimensions" | "metric" | "inputMode" | "compatibilityKey"
    > => ({
      model: identity.model,
      provider: identity.provider,
      dimensions: vector.length as EmbeddingDimensions,
      metric: identity.metric,
      inputMode: identity.inputMode,
      compatibilityKey: identity.compatibilityKey,
    }),
  };
});

const DEFAULT_EMBED_VECTOR = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8] as const;

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

beforeEach(() => {
  clearAllGenerations();
  embedMock.mockReset();
  embedMock.mockImplementation(async () => [...DEFAULT_EMBED_VECTOR]);
});

function makeFile(filePath: string, content: string): { path: string; bytes: Uint8Array } {
  return { path: filePath, bytes: new TextEncoder().encode(content) };
}

/** Build a real generation via buildGenerationFromFiles and return the published generation. */
function buildGeneration(
  attachmentId: string,
  files: Array<{ path: string; bytes: Uint8Array }>,
): DocumentGeneration {
  buildGenerationFromFiles(
    attachmentId,
    files,
    ["text/markdown"],
    markdownExtractor,
    markdownChunker,
    "abc123",
  );
  const generation = getCurrentGeneration(attachmentId);
  if (!generation) {
    throw new Error(`generation for attachment '${attachmentId}' was not published`);
  }
  return generation;
}

/**
 * Minimal ServerContext for embedGenerationChunks. The function only reads
 * `config.reindexEmbedConcurrency`, so only that field is populated.
 */
function makeContext(): ServerContext {
  return { config: { reindexEmbedConcurrency: 4 } } as unknown as ServerContext;
}

async function makeStorage(): Promise<{ dir: string; storage: ChunkEmbeddingStorage }> {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "mnemonic-sync-embedding-"));
  tempDirs.push(base);
  const dir = path.join(base, "doc-source", "att-1");
  const storage = new ChunkEmbeddingStorage(dir);
  await storage.init();
  return { dir, storage };
}

function makeStaleRecord(): ChunkEmbeddingRecord {
  return {
    chunkId: "att-1::docs/gone.md::Intro::0::0",
    contentHash: "stale-content-hash",
    model: embeddingModelId("test-model"),
    provider: embeddingProviderId("ollama"),
    dimensions: embeddingDimensions(8),
    metric: embeddingMetric("cosine"),
    compatibilityKey: embeddingCompatibilityKey("test-model"),
    embedding: [0.9, 0, 0, 0, 0, 0, 0, 0],
    updatedAt: isoDateString("2026-01-01T00:00:00.000Z"),
  };
}

const twoChunkFiles = [
  makeFile("docs/a.md", "# Alpha\n\nAlpha section content."),
  makeFile("docs/b.md", "# Beta\n\nBeta section content."),
];

function isDefined(value: string | undefined): value is string {
  return value !== undefined;
}

describe("embedGenerationChunks", () => {
  it("embeds every chunk during sync and persists records to disk", async () => {
    const { storage } = await makeStorage();
    const gen = buildGeneration("att-1", twoChunkFiles);
    expect(gen.chunks.size).toBe(2);

    await embedGenerationChunks(gen, makeContext(), "att-1", storage, new Map());

    expect(gen.chunkEmbeddings.size).toBe(2);
    for (const chunk of gen.chunks.values()) {
      expect(gen.chunkEmbeddings.get(chunk.chunkId)).toBeDefined();
    }
    expect(gen.manifest.embeddedChunkCount).toBe(2);
    expect(gen.manifest.embeddingFailures).toEqual([]);
    expect(embedMock).toHaveBeenCalledTimes(2);

    const onDisk = await storage.list();
    expect(onDisk).toHaveLength(2);
    for (const record of onDisk) {
      expect(record.embedding).toEqual([...DEFAULT_EMBED_VECTOR]);
      expect(record.model).toBe("test-model");
    }
  });

  it("fails soft when the embedding provider is unavailable", async () => {
    embedMock.mockImplementation(async () => {
      throw new Error("embedding service unavailable");
    });
    const { storage } = await makeStorage();
    const gen = buildGeneration("att-1", twoChunkFiles);

    await expect(
      embedGenerationChunks(gen, makeContext(), "att-1", storage, new Map()),
    ).resolves.toBeUndefined();

    expect(gen.chunkEmbeddings.size).toBe(0);
    expect(gen.manifest.embeddedChunkCount).toBe(0);
    expect(gen.manifest.embeddingFailures).toHaveLength(2);
    for (const failure of gen.manifest.embeddingFailures) {
      expect(failure.reason).toContain("embedding service unavailable");
    }
    expect(await storage.list()).toHaveLength(0);
  });

  it("caps embedding work per sync and leaves the rest lexical-only", async () => {
    const { storage } = await makeStorage();
    const gen = buildGeneration("att-1", [
      makeFile("docs/a.md", "# Alpha\n\nAlpha section content."),
      makeFile("docs/b.md", "# Beta\n\nBeta section content."),
      makeFile("docs/c.md", "# Gamma\n\nGamma section content."),
    ]);
    expect(gen.chunks.size).toBe(3);

    await embedGenerationChunks(gen, makeContext(), "att-1", storage, new Map(), 1);

    expect(embedMock).toHaveBeenCalledTimes(1);
    expect(gen.chunkEmbeddings.size).toBe(1);
    expect(gen.manifest.embeddedChunkCount).toBe(1);
    const onDisk = await storage.list();
    expect(onDisk).toHaveLength(1);
    // Deterministic recency tie-break: docs/a.md sorts first.
    expect(onDisk[0]?.chunkId).toContain("docs-a-md");
  });

  it("reuses on-disk embeddings for unchanged chunks and re-embeds only changed ones", async () => {
    const { storage } = await makeStorage();
    const fileA = makeFile("docs/a.md", "# Alpha\n\nAlpha section content.");
    const fileB = makeFile("docs/b.md", "# Beta\n\nBeta section content.");

    const firstGen = buildGeneration("att-1", [fileA, fileB]);
    await embedGenerationChunks(firstGen, makeContext(), "att-1", storage, new Map());
    expect(embedMock).toHaveBeenCalledTimes(2);

    const secondGen = buildGeneration("att-1", [fileA, fileB]);
    await embedGenerationChunks(secondGen, makeContext(), "att-1", storage, new Map());
    expect(embedMock).toHaveBeenCalledTimes(2);
    expect(secondGen.chunkEmbeddings.size).toBe(2);

    const thirdGen = buildGeneration("att-1", [
      fileA,
      makeFile("docs/b.md", "# Beta\n\nBeta section content changed."),
    ]);
    await embedGenerationChunks(thirdGen, makeContext(), "att-1", storage, new Map());
    expect(embedMock).toHaveBeenCalledTimes(3);
    expect(thirdGen.chunkEmbeddings.size).toBe(2);
    // The re-embedded chunk reflects the new content hash.
    const changedChunkId = Array.from(thirdGen.chunks.keys()).find((id) =>
      id.includes("docs-b-md"),
    );
    expect(isDefined(changedChunkId)).toBe(true);
    if (isDefined(changedChunkId)) {
      expect(thirdGen.chunkEmbeddings.get(changedChunkId)?.contentHash).not.toBe(
        secondGen.chunkEmbeddings.get(changedChunkId)?.contentHash,
      );
    }
  });

  it("sweeps stale on-disk chunk embeddings not present in the generation", async () => {
    const { storage } = await makeStorage();
    const gen = buildGeneration("att-1", [
      makeFile("docs/a.md", "# Alpha\n\nAlpha section content."),
    ]);
    const stale = makeStaleRecord();
    await storage.write(stale);
    expect(await storage.list()).toHaveLength(1);

    await sweepStaleChunkEmbeddings(storage, new Set(gen.chunks.keys()));

    expect(await storage.list()).toHaveLength(0);
  });
});

describe("isGenerationCurrent with a different embedding identity", () => {
  const extractor = {
    extractorId: markdownExtractor.extractorId,
    extractorVersion: markdownExtractor.extractorVersion,
  };
  const chunker = {
    chunkerId: markdownChunker.chunkerId,
    chunkerVersion: markdownChunker.chunkerVersion,
  };

  function expectedIdentityFor(model: string): string {
    return [
      extractor.extractorId,
      extractor.extractorVersion,
      chunker.chunkerId,
      chunker.chunkerVersion,
      mockIdentity.provider,
      model,
      mockIdentity.dimensions ?? "",
      mockIdentity.metric,
    ].join("::");
  }

  it("rejects a generation whose embedding identity predates an embedding-model change", () => {
    const currentIdentity = expectedIdentityFor(mockIdentity.model);
    const current = {
      manifest: {
        indexedCommit: "abc123",
        extractorVersion: extractor.extractorVersion,
        chunkerVersion: chunker.chunkerVersion,
        indexSchemaVersion: "2",
        embeddingCompatibilityIdentity: currentIdentity,
      },
    };
    expect(isGenerationCurrent(current, "abc123", extractor, chunker)).toBe(true);

    const stale = {
      manifest: {
        indexedCommit: "abc123",
        extractorVersion: extractor.extractorVersion,
        chunkerVersion: chunker.chunkerVersion,
        indexSchemaVersion: "2",
        embeddingCompatibilityIdentity: expectedIdentityFor("other-model"),
      },
    };
    expect(isGenerationCurrent(stale, "abc123", extractor, chunker)).toBe(false);
  });
});
