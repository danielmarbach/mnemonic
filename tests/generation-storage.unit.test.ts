import { describe, it, expect, beforeEach } from "vitest";
import {
  getCurrentGeneration,
  publishGeneration,
  evictGeneration,
  getGeneration,
  pinGeneration,
  unpinGeneration,
  clearAllGenerations,
  withGenerationLock,
} from "../src/generation-storage.js";
import type { DocumentGeneration, GenerationId } from "../src/retrieval-document.js";

const PROJECT = "test-project";

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
      expect(getCurrentGeneration(PROJECT, "att-1")).toBeNull();
    });

    it("returns the latest published generation", () => {
      const gen1 = makeGeneration("att-1", "gen-1");
      const gen2 = makeGeneration("att-1", "gen-2");
      publishGeneration(PROJECT, "att-1", gen1);
      publishGeneration(PROJECT, "att-1", gen2);
      expect(getCurrentGeneration(PROJECT, "att-1")?.manifest.generationId).toBe("gen-2");
    });

    it("returns null for an unknown attachment", () => {
      expect(getCurrentGeneration(PROJECT, "unknown-attachment")).toBeNull();
    });
  });

  describe("publishGeneration", () => {
    it("stores the generation and makes it current", () => {
      const gen = makeGeneration("att-1", "gen-1");
      publishGeneration(PROJECT, "att-1", gen);
      expect(getCurrentGeneration(PROJECT, "att-1")?.manifest.generationId).toBe("gen-1");
    });

    it("moves previous current to previous on new publish", () => {
      const gen1 = makeGeneration("att-1", "gen-1");
      const gen2 = makeGeneration("att-1", "gen-2");
      publishGeneration(PROJECT, "att-1", gen1);
      publishGeneration(PROJECT, "att-1", gen2);
      // gen1 should still be retrievable via getGeneration
      expect(getGeneration(PROJECT, "att-1", "gen-1")).not.toBeNull();
      expect(getGeneration(PROJECT, "att-1", "gen-1")?.manifest.generationId).toBe("gen-1");
    });

    it("evicts old generations beyond current and previous", () => {
      const gen1 = makeGeneration("att-1", "gen-1");
      const gen2 = makeGeneration("att-1", "gen-2");
      const gen3 = makeGeneration("att-1", "gen-3");
      publishGeneration(PROJECT, "att-1", gen1);
      publishGeneration(PROJECT, "att-1", gen2);
      publishGeneration(PROJECT, "att-1", gen3);
      // gen1 should be evicted (not current, not previous, not pinned)
      expect(getGeneration(PROJECT, "att-1", "gen-1")).toBeNull();
      // gen2 should be previous
      expect(getGeneration(PROJECT, "att-1", "gen-2")).not.toBeNull();
      // gen3 should be current
      expect(getGeneration(PROJECT, "att-1", "gen-3")).not.toBeNull();
    });

    it("handles independent attachment stores", () => {
      const genA = makeGeneration("att-a", "gen-a1");
      const genB = makeGeneration("att-b", "gen-b1");
      publishGeneration(PROJECT, "att-a", genA);
      publishGeneration(PROJECT, "att-b", genB);
      expect(getCurrentGeneration(PROJECT, "att-a")?.manifest.generationId).toBe("gen-a1");
      expect(getCurrentGeneration(PROJECT, "att-b")?.manifest.generationId).toBe("gen-b1");
    });

    it("isolates same attachmentId across different projectIds", () => {
      const genProj1 = makeGeneration("att-1", "gen-proj1");
      publishGeneration("proj-1", "att-1", genProj1);
      expect(getCurrentGeneration("proj-1", "att-1")?.manifest.generationId).toBe("gen-proj1");
      // proj-2 has its own empty store for the same attachmentId
      expect(getCurrentGeneration("proj-2", "att-1")).toBeNull();
    });
  });

  describe("evictGeneration", () => {
    it("removes state so getCurrentGeneration returns null after eviction", () => {
      const gen = makeGeneration("att-1", "gen-1");
      publishGeneration(PROJECT, "att-1", gen);
      expect(getCurrentGeneration(PROJECT, "att-1")).not.toBeNull();
      evictGeneration(PROJECT, "att-1");
      expect(getCurrentGeneration(PROJECT, "att-1")).toBeNull();
      expect(getGeneration(PROJECT, "att-1", "gen-1")).toBeNull();
    });

    it("only evicts the targeted project/attachment pair", () => {
      const gen = makeGeneration("att-1", "gen-1");
      publishGeneration("proj-1", "att-1", gen);
      publishGeneration("proj-2", "att-1", gen);
      evictGeneration("proj-1", "att-1");
      expect(getCurrentGeneration("proj-1", "att-1")).toBeNull();
      expect(getCurrentGeneration("proj-2", "att-1")).not.toBeNull();
    });

    it("does not throw when evicting an unknown key", () => {
      expect(() => evictGeneration("unknown-project", "unknown-attachment")).not.toThrow();
    });
  });

  describe("getGeneration", () => {
    it("returns a specific generation by ID", () => {
      const gen = makeGeneration("att-1", "gen-1");
      publishGeneration(PROJECT, "att-1", gen);
      expect(getGeneration(PROJECT, "att-1", "gen-1")?.manifest.generationId).toBe("gen-1");
    });

    it("returns null for a non-existent generation ID", () => {
      expect(getGeneration(PROJECT, "att-1", "non-existent")).toBeNull();
    });

    it("returns null for an unknown attachment", () => {
      expect(getGeneration(PROJECT, "unknown", "gen-1")).toBeNull();
    });
  });

  describe("pinGeneration / unpinGeneration", () => {
    it("pinned generations are not evicted on publish", () => {
      const gen1 = makeGeneration("att-1", "gen-1");
      const gen2 = makeGeneration("att-1", "gen-2");
      const gen3 = makeGeneration("att-1", "gen-3");
      publishGeneration(PROJECT, "att-1", gen1);
      pinGeneration(PROJECT, "att-1", "gen-1");
      publishGeneration(PROJECT, "att-1", gen2);
      publishGeneration(PROJECT, "att-1", gen3);
      // gen1 is pinned, so it should survive eviction
      expect(getGeneration(PROJECT, "att-1", "gen-1")).not.toBeNull();
      // gen2 should be previous (not evicted)
      expect(getGeneration(PROJECT, "att-1", "gen-2")).not.toBeNull();
    });

    it("unpinned generations are evicted on next publish", () => {
      const gen1 = makeGeneration("att-1", "gen-1");
      const gen2 = makeGeneration("att-1", "gen-2");
      const gen3 = makeGeneration("att-1", "gen-3");
      publishGeneration(PROJECT, "att-1", gen1);
      pinGeneration(PROJECT, "att-1", "gen-1");
      unpinGeneration(PROJECT, "att-1", "gen-1");
      publishGeneration(PROJECT, "att-1", gen2);
      publishGeneration(PROJECT, "att-1", gen3);
      // gen1 was unpinned, so it should be evicted
      expect(getGeneration(PROJECT, "att-1", "gen-1")).toBeNull();
    });

    it("unpinGeneration on unknown attachment does not throw", () => {
      expect(() => unpinGeneration(PROJECT, "unknown", "gen-1")).not.toThrow();
    });

    it("pinGeneration creates state for unknown attachment", () => {
      pinGeneration(PROJECT, "new-att", "gen-1");
      // Should not throw and should be retrievable after publish
      const gen = makeGeneration("new-att", "gen-1");
      publishGeneration(PROJECT, "new-att", gen);
      expect(getGeneration(PROJECT, "new-att", "gen-1")).not.toBeNull();
    });
  });

  describe("withGenerationLock", () => {
    it("serializes concurrent operations on the same key", async () => {
      let active = 0;
      let maxActive = 0;
      const results: string[] = [];

      const run = (tag: string) =>
        withGenerationLock(PROJECT, "att-1", async () => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          results.push(`${tag}:start`);
          await new Promise((r) => setTimeout(r, 20));
          results.push(`${tag}:end`);
          active -= 1;
          return tag;
        });

      const [a, b] = await Promise.all([run("a"), run("b")]);
      expect(maxActive).toBe(1);
      expect(results[0]).toBe("a:start");
      expect(results[1]).toBe("a:end");
      // b only starts after a finishes
      expect(results[2]).toBe("b:start");
      expect(a).toBe("a");
      expect(b).toBe("b");
    });

    it("allows concurrent operations on different keys", async () => {
      let active = 0;
      let maxActive = 0;

      const run = (attachmentId: string) =>
        withGenerationLock(PROJECT, attachmentId, async () => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          await new Promise((r) => setTimeout(r, 20));
          active -= 1;
          return attachmentId;
        });

      await Promise.all([run("att-1"), run("att-2")]);
      expect(maxActive).toBe(2);
    });

    it("does not share inflight state across projectIds", async () => {
      let active = 0;
      let maxActive = 0;

      const run = (projectId: string) =>
        withGenerationLock(projectId, "att-1", async () => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          await new Promise((r) => setTimeout(r, 20));
          active -= 1;
          return projectId;
        });

      await Promise.all([run("proj-1"), run("proj-2")]);
      expect(maxActive).toBe(2);
    });

    it("cleans up the inflight map after success", async () => {
      await withGenerationLock(PROJECT, "att-1", async () => "done");
      // A subsequent call on the same key must not wait for a stale operation.
      const fast = await withGenerationLock(PROJECT, "att-1", async () => "fast");
      expect(fast).toBe("fast");
    });

    it("cleans up the inflight map after an error", async () => {
      await expect(
        withGenerationLock(PROJECT, "att-1", async () => {
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");
      // The key must be released so a later call can run.
      const retry = await withGenerationLock(PROJECT, "att-1", async () => "retry");
      expect(retry).toBe("retry");
    });

    it("surfaces the result of the function", async () => {
      const result = await withGenerationLock(PROJECT, "att-1", async () => 42);
      expect(result).toBe(42);
    });
  });

  describe("clearAllGenerations", () => {
    it("clears all stores", () => {
      const gen = makeGeneration("att-1", "gen-1");
      publishGeneration(PROJECT, "att-1", gen);
      clearAllGenerations();
      expect(getCurrentGeneration(PROJECT, "att-1")).toBeNull();
      expect(getGeneration(PROJECT, "att-1", "gen-1")).toBeNull();
    });
  });
});
