import { beforeEach, describe, expect, it } from "vitest";
import { collectDocumentChunkCandidates } from "../src/document-recall.js";
import { buildGenerationFromFiles } from "../src/document-source-index.js";
import { clearAllGenerations, getCurrentGeneration } from "../src/generation-storage.js";
import { markdownChunker } from "../src/markdown-chunker.js";
import { markdownExtractor } from "../src/markdown-extractor.js";
import { embeddingModelId, isoDateString } from "../src/brands.js";
import type { ChunkEmbeddingRecord } from "../src/chunk-embedding-storage.js";

function makeFile(path: string, content: string): { path: string; bytes: Uint8Array } {
  return { path, bytes: new TextEncoder().encode(content) };
}

describe("collectDocumentChunkCandidates", () => {
  beforeEach(() => {
    clearAllGenerations();
  });

  it("does not let early weak matches hide a later exact match", () => {
    const sections = Array.from(
      { length: 6 },
      (_, index) => `## Section ${index}\n\nThis component contains general documentation.`,
    ).join("\n\n");
    const files = [
      makeFile(
        "docs/components.md",
        `# Components\n\n${sections}\n\n## Runner\n\nThe ComponentRunner starts the test component.`,
      ),
    ];

    buildGenerationFromFiles(
      "att-1",
      files,
      ["text/markdown"],
      markdownExtractor,
      markdownChunker,
      "abc123",
    );

    const results = collectDocumentChunkCandidates(["att-1"], "ComponentRunner", 1);

    expect(results).toHaveLength(1);
    expect(results[0]?.excerpt).toContain("ComponentRunner");
  });

  it("scores heading ancestry so navigation-style queries surface the right chunk", () => {
    // Query terms appear in a heading wrapped in backticks, not in body prose.
    // Without heading scoring the chunk would not match.
    const files = [
      makeFile(
        "docs/api.md",
        "# API\n\n## `MarkAsFailed()` and `MarkAsCancelled()`\n\nFailure methods for tests.",
      ),
    ];
    buildGenerationFromFiles(
      "att-2",
      files,
      ["text/markdown"],
      markdownExtractor,
      markdownChunker,
      "abc123",
    );

    const results = collectDocumentChunkCandidates(
      ["att-2"],
      "MarkAsFailed MarkAsCancelled failure methods",
      5,
    );

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.headingAncestry.at(-1)?.text).toBe("MarkAsFailed() and MarkAsCancelled()");
  });

  it("scores source path so path-oriented queries surface the document", () => {
    // Query terms appear only in the file path, not body or headings.
    const files = [
      makeFile(
        "nservicebus-acceptancetesting.md",
        "# Acceptance Testing\n\nGeneral overview content without the search term.",
      ),
    ];
    buildGenerationFromFiles(
      "att-3",
      files,
      ["text/markdown"],
      markdownExtractor,
      markdownChunker,
      "abc123",
    );

    const results = collectDocumentChunkCandidates(["att-3"], "nservicebus acceptancetesting", 5);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.sourcePath).toBe("nservicebus-acceptancetesting.md");
  });
});

describe("collectDocumentChunkCandidates semantic gating", () => {
  beforeEach(() => {
    clearAllGenerations();
  });

  it("does not give a semantic RRF boost to a negatively-correlated chunk", () => {
    // A chunk with a strong lexical match but an anti-parallel embedding
    // (cosine = -1) must not earn a semantic rank. The note path gates semantic
    // candidates by minSimilarity; the chunk path must do the equivalent so an
    // anti-correlated chunk cannot get a spurious RRF boost on top of its
    // lexical match. The fused score must equal the lexical-only score.
    const sections = Array.from(
      { length: 6 },
      (_, index) => `## Section ${index}\n\nThis component contains general documentation.`,
    ).join("\n\n");
    const files = [
      makeFile(
        "docs/components.md",
        `# Components\n\n${sections}\n\n## Runner\n\nThe ComponentRunner starts the test component.`,
      ),
    ];
    buildGenerationFromFiles(
      "att-gate",
      files,
      ["text/markdown"],
      markdownExtractor,
      markdownChunker,
      "abc123",
    );

    const gen = getCurrentGeneration("att-gate");
    if (!gen) throw new Error("generation not published");
    const runnerChunk = Array.from(gen.chunks.values()).find((c) =>
      c.content.includes("ComponentRunner"),
    );
    if (!runnerChunk) throw new Error("runner chunk not found");

    // Anti-parallel vectors: cosine similarity is exactly -1.
    const queryVec: number[] = [1, 0, 0, 0];
    const record: ChunkEmbeddingRecord = {
      chunkId: runnerChunk.chunkId,
      contentHash: "irrelevant-for-this-test",
      model: embeddingModelId("test-model"),
      embedding: [-1, 0, 0, 0],
      updatedAt: isoDateString("2026-01-01T00:00:00Z"),
    };
    gen.chunkEmbeddings.set(runnerChunk.chunkId, record);

    const withVec = collectDocumentChunkCandidates(["att-gate"], "ComponentRunner", 5, queryVec);
    const withoutVec = collectDocumentChunkCandidates(["att-gate"], "ComponentRunner", 5, null);

    const withVecTop = withVec[0];
    const withoutVecTop = withoutVec[0];
    if (!withVecTop || !withoutVecTop) {
      throw new Error("expected a ranked chunk in both paths");
    }

    // The negatively-correlated semantic signal is recorded for diagnostics...
    expect(withVecTop.semanticScore).toBe(-1);
    // ...but it must NOT change the fused score: the chunk gets no semantic rank,
    // so its score equals the lexical-only score.
    expect(withVecTop.score).toBeCloseTo(withoutVecTop.score, 10);
  });
});
