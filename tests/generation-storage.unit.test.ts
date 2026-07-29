import { describe, it, expect, beforeEach } from "vitest";
import {
  getCurrentGeneration,
  publishGeneration,
  getGeneration,
  pinGeneration,
  unpinGeneration,
  clearAllGenerations,
} from "../src/generation-storage.js";
import type { DocumentGeneration, GenerationId } from "../src/retrieval-document.js";

function makeGeneration(
  attachmentId: string,
  genId: string,
  docCount = 1,
  chunkCount = 1,
): DocumentGeneration {
  return {
    manifest: {
      generationId: genId as GenerationId,
      attachmentId,
      indexedCommit: "abc123def456",
      extractorId: "test-extractor",
      extractorVersion: "1",
      extractorOptionsHash: "default",
      chunkerId: "test-chunker",
      chunkerVersion: "1",
      chunkerOptionsHash: "default",
      projectionSchemaVersion: "1",
      indexSchemaVersion: "1",
      embeddingCompatibilityIdentity: "test-extractor::1::test-chunker::1",
      sourceMediaTypeCounts: { "text/markdown": docCount },
      documentCount: docCount,
      chunkCount: chunkCount,
      skippedFiles: [],
      builtAt: new Date().toISOString(),
    },
    documents: new Map(),
    chunks: new Map(),
    sourceBytes: new Map(),
    extractedText: new Map(),
  };
}

describe("generation-storage", () => {
  beforeEach(() => {
    clearAllGenerations();
  });

  describe("getCurrentGeneration", () => {
    it("returns null when no generation has been published", () => {
      expect(getCurrentGeneration("att-1")).toBeNull();
    });

    it("returns the latest published generation", () => {
      const gen1 = makeGeneration("att-1", "gen-1");
      const gen2 = makeGeneration("att-1", "gen-2");
      publishGeneration("att-1", gen1);
      publishGeneration("att-1", gen2);
      expect(getCurrentGeneration("att-1")?.manifest.generationId).toBe("gen-2");
    });

    it("returns null for an unknown attachment", () => {
      expect(getCurrentGeneration("unknown-attachment")).toBeNull();
    });
  });

  describe("publishGeneration", () => {
    it("stores the generation and makes it current", () => {
      const gen = makeGeneration("att-1", "gen-1");
      publishGeneration("att-1", gen);
      expect(getCurrentGeneration("att-1")?.manifest.generationId).toBe("gen-1");
    });

    it("moves previous current to previous on new publish", () => {
      const gen1 = makeGeneration("att-1", "gen-1");
      const gen2 = makeGeneration("att-1", "gen-2");
      publishGeneration("att-1", gen1);
      publishGeneration("att-1", gen2);
      // gen1 should still be retrievable via getGeneration
      expect(getGeneration("att-1", "gen-1")).not.toBeNull();
      expect(getGeneration("att-1", "gen-1")?.manifest.generationId).toBe("gen-1");
    });

    it("evicts old generations beyond current and previous", () => {
      const gen1 = makeGeneration("att-1", "gen-1");
      const gen2 = makeGeneration("att-1", "gen-2");
      const gen3 = makeGeneration("att-1", "gen-3");
      publishGeneration("att-1", gen1);
      publishGeneration("att-1", gen2);
      publishGeneration("att-1", gen3);
      // gen1 should be evicted (not current, not previous, not pinned)
      expect(getGeneration("att-1", "gen-1")).toBeNull();
      // gen2 should be previous
      expect(getGeneration("att-1", "gen-2")).not.toBeNull();
      // gen3 should be current
      expect(getGeneration("att-1", "gen-3")).not.toBeNull();
    });

    it("handles independent attachment stores", () => {
      const genA = makeGeneration("att-a", "gen-a1");
      const genB = makeGeneration("att-b", "gen-b1");
      publishGeneration("att-a", genA);
      publishGeneration("att-b", genB);
      expect(getCurrentGeneration("att-a")?.manifest.generationId).toBe("gen-a1");
      expect(getCurrentGeneration("att-b")?.manifest.generationId).toBe("gen-b1");
    });
  });

  describe("getGeneration", () => {
    it("returns a specific generation by ID", () => {
      const gen = makeGeneration("att-1", "gen-1");
      publishGeneration("att-1", gen);
      expect(getGeneration("att-1", "gen-1")?.manifest.generationId).toBe("gen-1");
    });

    it("returns null for a non-existent generation ID", () => {
      expect(getGeneration("att-1", "non-existent")).toBeNull();
    });

    it("returns null for an unknown attachment", () => {
      expect(getGeneration("unknown", "gen-1")).toBeNull();
    });
  });

  describe("pinGeneration / unpinGeneration", () => {
    it("pinned generations are not evicted on publish", () => {
      const gen1 = makeGeneration("att-1", "gen-1");
      const gen2 = makeGeneration("att-1", "gen-2");
      const gen3 = makeGeneration("att-1", "gen-3");
      publishGeneration("att-1", gen1);
      pinGeneration("att-1", "gen-1");
      publishGeneration("att-1", gen2);
      publishGeneration("att-1", gen3);
      // gen1 is pinned, so it should survive eviction
      expect(getGeneration("att-1", "gen-1")).not.toBeNull();
      // gen2 should be previous (not evicted)
      expect(getGeneration("att-1", "gen-2")).not.toBeNull();
    });

    it("unpinned generations are evicted on next publish", () => {
      const gen1 = makeGeneration("att-1", "gen-1");
      const gen2 = makeGeneration("att-1", "gen-2");
      const gen3 = makeGeneration("att-1", "gen-3");
      publishGeneration("att-1", gen1);
      pinGeneration("att-1", "gen-1");
      unpinGeneration("att-1", "gen-1");
      publishGeneration("att-1", gen2);
      publishGeneration("att-1", gen3);
      // gen1 was unpinned, so it should be evicted
      expect(getGeneration("att-1", "gen-1")).toBeNull();
    });

    it("unpinGeneration on unknown attachment does not throw", () => {
      expect(() => unpinGeneration("unknown", "gen-1")).not.toThrow();
    });

    it("pinGeneration creates state for unknown attachment", () => {
      pinGeneration("new-att", "gen-1");
      // Should not throw and should be retrievable after publish
      const gen = makeGeneration("new-att", "gen-1");
      publishGeneration("new-att", gen);
      expect(getGeneration("new-att", "gen-1")).not.toBeNull();
    });
  });

  describe("clearAllGenerations", () => {
    it("clears all stores", () => {
      const gen = makeGeneration("att-1", "gen-1");
      publishGeneration("att-1", gen);
      clearAllGenerations();
      expect(getCurrentGeneration("att-1")).toBeNull();
      expect(getGeneration("att-1", "gen-1")).toBeNull();
    });
  });
});
