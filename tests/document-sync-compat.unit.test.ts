import { describe, expect, it } from "vitest";
import { isGenerationCurrent } from "../src/document-sync.js";
import { markdownExtractor } from "../src/markdown-extractor.js";
import { markdownChunker } from "../src/markdown-chunker.js";
import { currentEmbeddingIdentity } from "../src/embeddings.js";

const extractor = {
  extractorId: markdownExtractor.extractorId,
  extractorVersion: markdownExtractor.extractorVersion,
};
const chunker = {
  chunkerId: markdownChunker.chunkerId,
  chunkerVersion: markdownChunker.chunkerVersion,
};

// Must mirror the production 8-part embedding-compatibility identity
// (src/document-sync.ts buildEmbeddingCompatibilityIdentity).
const expectedEmbeddingCompatibilityIdentity = [
  extractor.extractorId,
  extractor.extractorVersion,
  chunker.chunkerId,
  chunker.chunkerVersion,
  currentEmbeddingIdentity.provider,
  currentEmbeddingIdentity.model,
  currentEmbeddingIdentity.dimensions ?? "",
  currentEmbeddingIdentity.metric,
].join("::");

function makeGeneration(
  overrides: Partial<{
    indexedCommit: string;
    extractorVersion: string;
    chunkerVersion: string;
    indexSchemaVersion: string;
    embeddingCompatibilityIdentity: string;
  }> = {},
) {
  return {
    manifest: {
      indexedCommit: overrides.indexedCommit ?? "commit-1",
      extractorVersion: overrides.extractorVersion ?? extractor.extractorVersion,
      chunkerVersion: overrides.chunkerVersion ?? chunker.chunkerVersion,
      indexSchemaVersion: overrides.indexSchemaVersion ?? "2",
      embeddingCompatibilityIdentity:
        overrides.embeddingCompatibilityIdentity ?? expectedEmbeddingCompatibilityIdentity,
    },
  };
}

describe("isGenerationCurrent", () => {
  it("returns true when commit and all versions match", () => {
    expect(isGenerationCurrent(makeGeneration(), "commit-1", extractor, chunker)).toBe(true);
  });

  it("returns false when there is no generation", () => {
    expect(isGenerationCurrent(undefined, "commit-1", extractor, chunker)).toBe(false);
  });

  it("returns false when the pinned commit changed", () => {
    expect(isGenerationCurrent(makeGeneration(), "commit-2", extractor, chunker)).toBe(false);
  });

  it("returns false when the chunker version was bumped (re-index required)", () => {
    const stale = makeGeneration({ chunkerVersion: "1" });
    expect(isGenerationCurrent(stale, "commit-1", extractor, chunker)).toBe(false);
  });

  it("returns false when the extractor version changed", () => {
    const stale = makeGeneration({ extractorVersion: "0" });
    expect(isGenerationCurrent(stale, "commit-1", extractor, chunker)).toBe(false);
  });

  it("returns false when the embedding compatibility identity changed", () => {
    const stale = makeGeneration({ embeddingCompatibilityIdentity: "stale::identity" });
    expect(isGenerationCurrent(stale, "commit-1", extractor, chunker)).toBe(false);
  });
});
